import React, { useEffect, useState } from "react";
import { apiGet } from "../api";
import { useAuth } from "../context/AuthContext";
import { CLUB_ROLE_LABEL, label } from "../constants";
import Sidebar from "../components/Sidebar";

/** The public club directory (L-03). Joining a club arrives with L-05. */
export default function ClubsPage() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const mine = new Map((user?.clubs ?? []).map(c => [c.id, c]));

  useEffect(() => {
    apiGet("/api/auth/clubs")
      .then(r => (r.ok ? r.json() : []))
      .then(list => setClubs(Array.isArray(list) ? list : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dash-layout">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Clubs</h1>
            <p className="dash-sub">Clubs running their tournaments on DrawMaster.</p>
          </div>
        </div>
        <section className="dash-section">
          {loading ? (
            <div className="dash-empty">Loading…</div>
          ) : clubs.length === 0 ? (
            <div className="dash-empty"><div className="dash-empty-icon">🏟️</div><p>No clubs yet.</p></div>
          ) : (
            <div className="tournament-grid">
              {clubs.map(c => (
                <div key={c.id} className="t-card">
                  <h3 className="t-card-name">{c.name}</h3>
                  <div className="t-card-meta">
                    {(c.city || c.country) && <span>📍 {[c.city, c.country].filter(Boolean).join(", ")}</span>}
                  </div>
                  {mine.has(c.id) && (
                    <div className="t-card-action">
                      <span className="t-card-status-pill t-card-status-approved">{label(CLUB_ROLE_LABEL, mine.get(c.id).role)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
