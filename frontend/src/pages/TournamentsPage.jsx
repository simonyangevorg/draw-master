import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, apiPatch } from "../api";
import { STATUS_BADGE, SURFACE_LABEL, TYPE_LABEL } from "../constants";
import Sidebar from "../components/Sidebar";

export default function TournamentsPage() {
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

  async function handleApply(tournamentId, e) {
    e.preventDefault();
    const res = await apiPost(`/api/tournaments/${tournamentId}/participants`, { playerId: user.id });
    if (res.ok) {
      const p = await res.json();
      setParticipations(prev => ({ ...prev, [tournamentId]: { participantId: p.id, status: p.status } }));
    }
  }

  async function handleWithdraw(tournamentId, participantId, e) {
    e.preventDefault();
    const res = await apiPatch(`/api/tournaments/${tournamentId}/participants/${participantId}/withdraw`);
    if (res.ok) {
      setParticipations(prev => ({ ...prev, [tournamentId]: { ...prev[tournamentId], status: "WITHDRAWN" } }));
    }
  }

  return (
    <div className="dash-layout">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Tournaments</h1>
            <p className="dash-sub">Browse and apply to open tournaments.</p>
          </div>
          {user?.role === "ORGANISER" && (
            <Link to="/tournaments/new" className="btn btn-primary btn-lg">
              + New Tournament
            </Link>
          )}
        </div>

        <section className="dash-section">
          {loading ? (
            <div className="dash-empty">Loading…</div>
          ) : tournaments.length === 0 ? (
            <div className="dash-empty">
              <div className="dash-empty-icon">🏆</div>
              <p>No tournaments available yet.</p>
            </div>
          ) : (
            <div className="tournament-grid">
              {tournaments.map(t => (
                <TournamentCard
                  key={t.id}
                  t={t}
                  isOwn={t.organiserId === user?.id}
                  participation={participations[t.id]}
                  onApply={handleApply}
                  onWithdraw={handleWithdraw}
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
      <div className="t-card-dates">{t.startDate} → {t.endDate}</div>

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
      {isOwn && (
        <div className="t-card-action">
          <span className="t-card-status-pill" style={{ background: "var(--green-light)", color: "var(--green-dark)" }}>Your tournament</span>
        </div>
      )}
    </Link>
  );
}
