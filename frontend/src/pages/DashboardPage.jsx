import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGet } from "../api";
import { STATUS_BADGE, SURFACE_LABEL, TYPE_LABEL } from "../constants";
import Sidebar from "../components/Sidebar";

export default function DashboardPage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [participations, setParticipations] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet("/api/tournaments/").then(r => r.json()),
      apiGet("/api/tournaments/me/participations").then(r => r.json()),
    ])
      .then(([ts, ps]) => {
        setTournaments(Array.isArray(ts) ? ts : []);
        if (Array.isArray(ps)) {
          const map = {};
          ps.forEach(p => { map[p.tournamentId] = { participantId: p.id, status: p.status }; });
          setParticipations(map);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const myTournaments = tournaments.filter(t => t.organiserId === user?.id);
  const participatedTournaments = tournaments.filter(t => participations[t.id]);

  const isOrganiser = user?.role === "ORGANISER";

  return (
    <div className="dash-layout">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Welcome back, {user?.name?.split(" ")[0]} 👋</h1>
            <p className="dash-sub">Here's what's happening with your tournaments.</p>
          </div>
          {isOrganiser && (
            <Link to="/tournaments/new" className="btn btn-primary btn-lg">
              + New Tournament
            </Link>
          )}
        </div>

        {/* Stats row */}
        <div className="stats-row">
          {isOrganiser ? (
            <>
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
            </>
          ) : (
            <>
              <div className="stat-card">
                <div className="stat-value">{tournaments.length}</div>
                <div className="stat-label">Total Tournaments</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{participatedTournaments.filter(t => participations[t.id]?.status === "APPROVED").length}</div>
                <div className="stat-label">Approved Entries</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{participatedTournaments.filter(t => participations[t.id]?.status === "PENDING").length}</div>
                <div className="stat-label">Pending Applications</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{tournaments.filter(t => t.status === "OPEN").length}</div>
                <div className="stat-label">Open for Registration</div>
              </div>
            </>
          )}
        </div>

        {/* Organiser: my tournaments */}
        {isOrganiser && (
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
                {myTournaments.map(t => <TournamentCard key={t.id} t={t} />)}
              </div>
            )}
          </section>
        )}

        {/* Member: my participations */}
        {!isOrganiser && (
          <section className="dash-section">
            <div className="dash-section-header">
              <h2>My Participations</h2>
              <Link to="/tournaments" className="form-link">Browse all →</Link>
            </div>
            {loading ? (
              <div className="dash-empty">Loading…</div>
            ) : participatedTournaments.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon">🎾</div>
                <p>You haven't applied to any tournaments yet.</p>
                <Link to="/tournaments" className="btn btn-primary">Browse Tournaments</Link>
              </div>
            ) : (
              <div className="tournament-grid">
                {participatedTournaments.map(t => (
                  <TournamentCard key={t.id} t={t} participationStatus={participations[t.id]?.status} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function TournamentCard({ t, participationStatus }) {
  const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.DRAFT;

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
      <div className="t-card-dates">{t.startDate} → {t.endDate}</div>
      {participationStatus && (
        <div className="t-card-action">
          <span className={`t-card-status-pill t-card-status-${participationStatus.toLowerCase()}`}>
            {participationStatus.charAt(0) + participationStatus.slice(1).toLowerCase()}
          </span>
        </div>
      )}
    </Link>
  );
}
