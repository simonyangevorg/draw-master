import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";

/**
 * Change your password. Also where the bootstrapped super-admin is sent on
 * first sign-in, until they replace the initial password (L-02).
 */
export default function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const forced = !!user?.mustChangePassword;

  function handleChange(e) {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.next.length < 8) { setError("Use at least 8 characters."); return; }
    if (form.next !== form.confirm) { setError("The new passwords don't match."); return; }
    setLoading(true);
    try {
      await changePassword(form.current, form.next);
      if (forced) navigate("/dashboard", { replace: true });
      else { setDone(true); setForm({ current: "", next: "", confirm: "" }); }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dash-layout">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Change password</h1>
            {forced && <p className="dash-sub">Choose your own password before you continue.</p>}
          </div>
        </div>
        <div className="form-card" style={{ maxWidth: 440 }}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {done && <div className="alert alert-success" role="status">Password changed.</div>}
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="current">Current password</label>
              <input id="current" name="current" type="password" autoComplete="current-password" value={form.current} onChange={handleChange} disabled={loading} />
            </div>
            <div className="form-group">
              <label htmlFor="next">New password</label>
              <input id="next" name="next" type="password" autoComplete="new-password" value={form.next} onChange={handleChange} disabled={loading} />
            </div>
            <div className="form-group">
              <label htmlFor="confirm">Confirm new password</label>
              <input id="confirm" name="confirm" type="password" autoComplete="new-password" value={form.confirm} onChange={handleChange} disabled={loading} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Saving…" : "Change password"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
