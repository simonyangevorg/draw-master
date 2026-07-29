import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGet } from "../api";
import { STATUS_BADGE, SURFACE_LABEL, TYPE_LABEL } from "../constants";
import Sidebar from "../components/Sidebar";

export default function ProfilePage() {
  const { user } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [participations, setParticipations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet("/api/tournaments/").then(r => r.json()),
      apiGet("/api/tournaments/me/participations").then(r => r.json()),
    ])
      .then(([ts, ps]) => {
        setTournaments(Array.isArray(ts) ? ts : []);
        setParticipations(Array.isArray(ps) ? ps : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const myTournaments = tournaments.filter(t => t.organiserId === user?.id);
  const approved = participations.filter(p => p.status === "APPROVED");
  const pending = participations.filter(p => p.status === "PENDING");

  const roleColor = {
    ORGANISER: { bg: "#e8f5ee", color: "#1f5c3a" },
    MEMBER:    { bg: "#eff6ff", color: "#1d4ed8" },
    GUEST:     { bg: "#f3f4f6", color: "#374151" },
  }[user?.role] ?? { bg: "#f3f4f6", color: "#374151" };

  return (
    <div className="dash-layout">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Profile</h1>
            <p className="dash-sub">Your account details and activity summary.</p>
          </div>
        </div>

        {/* Profile card */}
        <section className="dash-section">
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "2rem",
            display: "flex",
            gap: "1.5rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            <div style={{
              width: 72, height: 72,
              background: "var(--green)", color: "#fff",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.75rem", fontWeight: 700, flexShrink: 0,
            }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{user?.name}</div>
              <div style={{ color: "var(--text-muted)", fontSize: ".9rem", marginTop: ".25rem" }}>{user?.email}</div>
              <div style={{ marginTop: ".6rem" }}>
                <span style={{
                  background: roleColor.bg, color: roleColor.color,
                  padding: ".2rem .75rem", borderRadius: 999,
                  fontSize: ".75rem", fontWeight: 700,
                }}>
                  {user?.role}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Activity stats */}
        <section className="dash-section">
          <div className="dash-section-header"><h2>Activity</h2></div>
          <div className="stats-row">
            {user?.role === "ORGANISER" && (
              <div className="stat-card">
                <div className="stat-value">{myTournaments.length}</div>
                <div className="stat-label">Tournaments Organised</div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-value">{participations.length}</div>
              <div className="stat-label">Total Applications</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{approved.length}</div>
              <div className="stat-label">Approved Entries</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{pending.length}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>
        </section>

        {/* Recent activity */}
        {!loading && participations.length > 0 && (
          <section className="dash-section">
            <div className="dash-section-header">
              <h2>My Applications</h2>
              <Link to="/tournaments" className="form-link">Browse all →</Link>
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {participations.map((p, i) => {
                const t = tournaments.find(t => t.id === p.tournamentId);
                if (!t) return null;
                const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.DRAFT;
                const pColors = { APPROVED: "#2d7a4f", PENDING: "#d97706", WITHDRAWN: "#6b7280", REJECTED: "#dc2626" };
                return (
                  <Link key={p.id ?? i} to={`/tournaments/${t.id}`} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "1rem 1.25rem", gap: "1rem", flexWrap: "wrap",
                    borderBottom: i < participations.length - 1 ? "1px solid var(--border)" : "none",
                    color: "inherit",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{t.name}</div>
                      <div style={{ fontSize: ".8rem", color: "var(--text-muted)", marginTop: ".15rem" }}>
                        {TYPE_LABEL[t.tournamentType] ?? t.tournamentType}
                        {t.city ? ` · ${t.city}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexShrink: 0 }}>
                      <span style={{ background: badge.color, color: "#fff", padding: ".15rem .6rem", borderRadius: 999, fontSize: ".72rem", fontWeight: 700 }}>
                        {badge.label}
                      </span>
                      <span style={{ color: pColors[p.status] ?? "#6b7280", fontSize: ".8rem", fontWeight: 600 }}>
                        {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
