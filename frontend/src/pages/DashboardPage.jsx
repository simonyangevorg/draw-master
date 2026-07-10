import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, apiPatch } from "../api";

const STATUS_BADGE = {
  DRAFT:       { label: "Draft",       color: "#6b7280" },
  OPEN:        { label: "Open",        color: "#2d7a4f" },
  IN_PROGRESS: { label: "In Progress", color: "#d97706" },
  COMPLETED:   { label: "Completed",   color: "#1d4ed8" },
  CANCELLED:   { label: "Cancelled",   color: "#dc2626" },
};

const TYPE_LABEL = {
  SINGLES_MEN:    "Singles Men",
  SINGLES_WOMEN:  "Singles Women",
  DOUBLES_MEN:    "Doubles Men",
  DOUBLES_WOMEN:  "Doubles Women",
  MIXED_DOUBLES:  "Mixed Doubles",
};

const SURFACE_LABEL = {
  CLAY:             "Clay",
  HARD_OUTDOOR:     "Hard (Outdoor)",
  HARD_INDOOR:      "Hard (Indoor)",
  GRASS:            "Grass",
  CARPET:           "Carpet",
  ACRYLIC:          "Acrylic",
  ARTIFICIAL_CLAY:  "Artificial Clay",
  ARTIFICIAL_GRASS: "Artificial Grass",
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [participations, setParticipations] = useState({}); // { tournamentId: { participantId, status } }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/tournaments/")
      .then(r => r.json())
      .then(data => setTournaments(Array.isArray(data) ? data : []))
      .catch(() => setTournaments([]))
      .finally(() => setLoading(false));

    apiGet("/api/tournaments/me/participations")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map = {};
          data.forEach(p => { map[p.tournamentId] = { participantId: p.participantId, status: p.status }; });
          setParticipations(map);
        }
      })
      .catch(() => {});
  }, []);

  async function quickApply(tournamentId, e) {
    e.preventDefault();
    const res = await apiPost(`/api/tournaments/${tournamentId}/participants`, { playerId: user.id });
    if (res.ok) {
      const p = await res.json();
      setParticipations(prev => ({ ...prev, [tournamentId]: { participantId: p.id, status: p.status } }));
    }
  }

  async function quickWithdraw(tournamentId, participantId, e) {
    e.preventDefault();
    const res = await apiPatch(`/api/tournaments/${tournamentId}/participants/${participantId}/withdraw`);
    if (res.ok) {
      setParticipations(prev => ({ ...prev, [tournamentId]: { ...prev[tournamentId], status: "WITHDRAWN" } }));
    }
  }

  const myTournaments = tournaments.filter(t => t.organiserId === user?.id);
  const otherTournaments = tournaments.filter(t => t.organiserId !== user?.id);

  return (
    <div className="dash-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <Link to="/" className="sidebar-logo">
          <img src="/logo.png" alt="FPTC" className="sidebar-logo-img" />
        </Link>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className="sidebar-link sidebar-link-active">
            <span>🏠</span> Dashboard
          </Link>
          {user?.role === "ORGANISER" && (
            <Link to="/tournaments/new" className="sidebar-link">
              <span>➕</span> New Tournament
            </Link>
          )}
          <Link to="/tournaments" className="sidebar-link">
            <span>🏆</span> Tournaments
          </Link>
          <Link to="/profile" className="sidebar-link">
            <span>👤</span> Profile
          </Link>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user?.name?.[0]?.toUpperCase()}</div>
            <div>
              <div className="sidebar-user-name">{user?.name}</div>
              <div className="sidebar-user-role">{user?.role}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); navigate("/"); }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Welcome back, {user?.name?.split(" ")[0]} 👋</h1>
            <p className="dash-sub">Here's what's happening with your tournaments.</p>
          </div>
          {user?.role === "ORGANISER" && (
            <Link to="/tournaments/new" className="btn btn-primary btn-lg">
              + New Tournament
            </Link>
          )}
        </div>

        {/* Stats row */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{myTournaments.length}</div>
            <div className="stat-label">My Tournaments</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{myTournaments.filter(t => t.status === "OPEN").length}</div>
            <div className="stat-label">Open for Registration</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{myTournaments.filter(t => t.status === "IN_PROGRESS").length}</div>
            <div className="stat-label">In Progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{tournaments.length}</div>
            <div className="stat-label">Total Tournaments</div>
          </div>
        </div>

        {/* My tournaments */}
        {user?.role === "ORGANISER" && (
          <section className="dash-section">
            <div className="dash-section-header">
              <h2>My Tournaments</h2>
              <Link to="/tournaments/new" className="form-link">Create new →</Link>
            </div>
            {loading ? (
              <div className="dash-empty">Loading…</div>
            ) : myTournaments.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon">🏆</div>
                <p>No tournaments yet.</p>
                <Link to="/tournaments/new" className="btn btn-primary">Create your first tournament</Link>
              </div>
            ) : (
              <div className="tournament-grid">
                {myTournaments.map(t => <TournamentCard key={t.id} t={t} isOwn />)}
              </div>
            )}
          </section>
        )}

        {/* Browse all tournaments */}
        <section className="dash-section">
          <div className="dash-section-header">
            <h2>All Tournaments</h2>
          </div>
          {loading ? (
            <div className="dash-empty">Loading…</div>
          ) : otherTournaments.length === 0 ? (
            <div className="dash-empty">No other tournaments at the moment.</div>
          ) : (
            <div className="tournament-grid">
              {otherTournaments.map(t => (
                <TournamentCard
                  key={t.id}
                  t={t}
                  participation={participations[t.id]}
                  onApply={quickApply}
                  onWithdraw={quickWithdraw}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function TournamentCard({ t, isOwn, participation, onApply, onWithdraw }) {
  const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.DRAFT;
  const status = participation?.status;

  return (
    <Link to={`/tournaments/${t.id}`} className="t-card">
      <div className="t-card-header">
        <span className="t-badge" style={{ background: badge.color }}>{badge.label}</span>
        <span className="t-surface">{SURFACE_LABEL[t.surface] ?? t.surface}</span>
      </div>
      <h3 className="t-card-name">{t.name}</h3>
      <div className="t-card-meta">
        <span>{TYPE_LABEL[t.tournamentType] ?? t.tournamentType}</span>
        {t.city && <span>📍 {t.city}</span>}
      </div>
      <div className="t-card-dates">
        {t.startDate} → {t.endDate}
      </div>

      {!isOwn && (
        <div className="t-card-action" onClick={e => e.stopPropagation()}>
          {t.status === "OPEN" && !status && (
            <button className="btn btn-primary btn-sm" onClick={e => onApply(t.id, e)}>Apply</button>
          )}
          {status === "PENDING" && (
            <span className="t-card-status-pill t-card-status-pending">Pending</span>
          )}
          {status === "APPROVED" && t.status === "OPEN" && (
            <button className="btn btn-ghost btn-sm" onClick={e => onWithdraw(t.id, participation.participantId, e)}>Withdraw</button>
          )}
          {status === "APPROVED" && t.status !== "OPEN" && (
            <span className="t-card-status-pill t-card-status-approved">Registered</span>
          )}
          {status === "WITHDRAWN" && (
            <span className="t-card-status-pill" style={{ color: "#6b7280" }}>Withdrawn</span>
          )}
        </div>
      )}
    </Link>
  );
}
