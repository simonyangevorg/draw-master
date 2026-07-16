import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLES = [
  {
    value: "MEMBER",
    label: "Club Member",
    icon: "🎾",
    desc: "Registered player of a tennis club",
  },
  {
    value: "GUEST",
    label: "Guest Participant",
    icon: "👤",
    desc: "Apply to tournaments outside your club",
  },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1 = pick role, 2 = fill details
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", role: "", clubId: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function selectRole(role) {
    setForm((p) => ({ ...p, role }));
    setStep(2);
  }

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
      navigate("/");
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const selectedRole = ROLES.find((r) => r.value === form.role);

  return (
    <div className="login-page">
      {/* Left panel */}
      <div className="login-left" aria-hidden="true">
        <div className="login-brand">
          <Link to="/">
            <img src="/logo.png" alt="FPTC" className="login-logo-img" />
          </Link>
          <p className="login-brand-tagline">
            Join the F*ck Pushers Tennis Club platform. Manage tournaments, track matches, and compete.
          </p>
        </div>
        <div className="login-court-bg" />
      </div>

      {/* Right panel */}
      <div className="login-right">
        <div className="login-card" style={{ maxWidth: step === 1 ? 520 : 420 }}>

          {step === 1 && (
            <>
              <div className="login-header">
                <h1>Create account</h1>
                <p>What best describes you?</p>
              </div>
              <div className="role-grid">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    className="role-card"
                    onClick={() => selectRole(r.value)}
                    type="button"
                  >
                    <span className="role-icon">{r.icon}</span>
                    <span className="role-label">{r.label}</span>
                    <span className="role-desc">{r.desc}</span>
                  </button>
                ))}
              </div>
              <p className="login-footer-text">
                Want to organise tournaments? Ask an existing organiser to upgrade your account after you sign up.
              </p>
              <p className="login-footer-text">
                Already have an account?{" "}
                <Link to="/login" className="form-link">Sign in</Link>
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="login-header">
                <button className="back-btn" onClick={() => setStep(1)} type="button">
                  ← Back
                </button>
                <h1>Create account</h1>
                <p>
                  Joining as{" "}
                  <strong>{selectedRole?.icon} {selectedRole?.label}</strong>
                </p>
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

                {form.role === "MEMBER" && (
                  <div className="form-group">
                    <label htmlFor="clubId">Club ID <span className="optional">(optional)</span></label>
                    <input
                      id="clubId" name="clubId" type="text"
                      placeholder="Your club's ID"
                      value={form.clubId} onChange={handleChange}
                      disabled={loading}
                    />
                  </div>
                )}

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
