import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-left" aria-hidden="true">
        <div className="login-brand">
          <Link to="/">
            <img src="/logo.png" alt="FPTC" className="login-logo-img" />
          </Link>
          <p className="login-brand-tagline">
            Your all-in-one platform for professional tennis tournament management.
          </p>
        </div>
        <div className="login-court-bg" />
      </div>

      <div className="login-right">
        <div className="login-card">
          <div className="login-header">
            <h1>Welcome back</h1>
            <p>Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <div className="form-group-row">
                <label htmlFor="password">Password</label>
                <a href="#" className="form-link">
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="login-footer-text">
            Don't have an account?{" "}
            <Link to="/register" className="form-link">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
