import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "../components/Logo";

const FEATURES = [
  {
    icon: "🏆",
    title: "Tournaments & entries",
    desc: "Create a tournament, open entries, and approve players online. No spreadsheets.",
  },
  {
    icon: "🎾",
    title: "Three draw formats",
    desc: "Single elimination, round robin, or groups followed by a knockout, with seeding.",
  },
  {
    icon: "📋",
    title: "Live draws",
    desc: "Enter a score and the winner moves straight into the next round for everyone to see.",
  },
  {
    icon: "📱",
    title: "Works on your phone",
    desc: "Run the draw from courtside: every page works on a phone as well as a laptop.",
  },
];

export default function LandingPage() {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <div className="landing">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="navbar-inner">
          <Link to="/" className="navbar-logo">
            <Logo size={36} />
          </Link>
          <div className="navbar-links">
            <a href="#features">Features</a>
            <a href="#about">About</a>
            {isAuthenticated ? (
              <>
                <span className="navbar-user">Hi, {user.name}</span>
                <button className="btn btn-ghost" onClick={logout}>
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary btn-lg">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">Professional Tennis Management</div>
          <h1 className="hero-title">
            Run Your Tournament<br />
            <span className="hero-accent">Like a Champion</span>
          </h1>
          <p className="hero-sub">
            Organize tournaments, manage players, track live scores, and deliver
            a world-class experience — all in one platform.
          </p>
          <div className="hero-cta">
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg">
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-primary btn-lg">
                  Get started
                </Link>
                <a href="#features" className="btn btn-ghost btn-lg">
                  Learn more
                </a>
              </>
            )}
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="court">
            <div className="court-line court-center" />
            <div className="court-line court-service-left" />
            <div className="court-line court-service-right" />
            <div className="court-net" />
            <div className="tennis-ball" />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="features" id="features">
        <div className="section-inner">
          <h2 className="section-title">Everything you need</h2>
          <p className="section-sub">
            Built for tournament directors, coaches, and tennis enthusiasts.
          </p>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <div className="feature-card" key={f.title}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="cta-banner" id="about">
        <div className="section-inner cta-inner">
          <Logo size={56} light className="dm-logo-cta" />
          <h2>Ready to serve?</h2>
          <p>Enter your club's next tournament and follow it live on DrawMaster.</p>
          {!isAuthenticated && (
            <Link to="/login" className="btn btn-white btn-lg">
              Create your account
            </Link>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="section-inner footer-inner">
          <Logo size={36} />
          <span className="footer-copy">© {new Date().getFullYear()} DrawMaster. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
