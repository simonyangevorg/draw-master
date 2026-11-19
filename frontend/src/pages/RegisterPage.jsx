import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError("Please fill in all required fields.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await register(form);
      // New accounts land on the dashboard, or where they were heading (B-20).
      const from = location.state?.from;
      navigate(from?.pathname ? from.pathname + (from.search ?? "") : "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      {/* Left panel */}
      <div className="login-left" aria-hidden="true">
        <div className="login-brand">
          <Link to="/">
            <Logo size={52} light className="dm-logo-login" />
          </Link>
          <p className="login-brand-tagline">
            Join DrawMaster to enter your club's tournaments, follow the draw and see every result.
          </p>
        </div>
        <div className="login-court-bg" />
      </div>

      {/* Right panel */}
      <div className="login-right">
        <div className="login-card" style={{ maxWidth: 420 }}>

          <>
              <div className="login-header">
                <h1>Create account</h1>
                <p>Sign up as a player, then join your club.</p>
              </div>

              {error && (
                <div className="alert alert-error" role="alert">{error}</div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label htmlFor="name">Full name</label>
                  <input
                    id="name" name="name" type="text"
                    placeholder="John Doe"
                    value={form.name} onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email" name="email" type="email"
                    placeholder="you@example.com"
                    value={form.email} onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password" name="password" type="password"
                    placeholder="Min. 6 characters"
                    value={form.password} onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirm">Confirm password</label>
                  <input
                    id="confirm" name="confirm" type="password"
                    placeholder="••••••••"
                    value={form.confirm} onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </form>

              <p className="login-footer-text">
                Already have an account?{" "}
                <Link to="/login" className="form-link">Sign in</Link>
              </p>
              <p className="login-footer-text">
                Running a club? Club admins are set up by DrawMaster; get in touch once you've signed up.
              </p>
          </>
        </div>
      </div>
    </div>
  );
}
