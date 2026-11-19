import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiPost, errorMessage } from "../api";
import Sidebar from "../components/Sidebar";

const EMPTY = { name: "", city: "", country: "", contactEmail: "" };

/** Super-admin: every club, and opening a new one (L-03). */
export default function AdminClubsPage() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet("/api/auth/admin/clubs")
      .then(r => (r.ok ? r.json() : []))
      .then(list => setClubs(Array.isArray(list) ? list : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleChange(e) {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  }

  async function createClub(e) {
    e.preventDefault();
    if (form.name.trim().length < 2) { setError("Give the club a name."); return; }
    setSaving(true);
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
    const res = await apiPost("/api/auth/admin/clubs", body);
    setSaving(false);
    if (!res.ok) { setError(await errorMessage(res, "Could not create the club")); return; }
    const club = await res.json();
    navigate(`/admin/clubs/${club.id}`); // next step: appoint its admins
  }

  return (
    <div className="dash-layout">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Manage clubs</h1>
            <p className="dash-sub">Open clubs and appoint the admins who run their tournaments.</p>
          </div>
        </div>

        <section className="dash-section">
          <div className="dash-section-header"><h2>Open a club</h2></div>
          <form className="form-card" onSubmit={createClub} noValidate>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Club name *</label>
                <input id="name" name="name" maxLength={100} value={form.name} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="contactEmail">Contact email</label>
                <input id="contactEmail" name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="city">City</label>
                <input id="city" name="city" maxLength={100} value={form.city} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="country">Country</label>
                <input id="country" name="country" maxLength={100} value={form.country} onChange={handleChange} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Opening…" : "Open club"}</button>
          </form>
        </section>

        <section className="dash-section">
          <div className="dash-section-header"><h2>All clubs</h2></div>
          {loading ? <div className="dash-empty">Loading…</div> : clubs.length === 0 ? (
            <div className="dash-empty">No clubs yet. Open the first one above.</div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Club</th><th>City</th><th>Admins</th><th>Status</th></tr></thead>
                <tbody>
                  {clubs.map(c => (
                    <tr key={c.id}>
                      <td><Link to={`/admin/clubs/${c.id}`} className="form-link">{c.name}</Link></td>
                      <td>{c.city || "—"}</td>
                      <td>{c.adminCount === 0 ? <span style={{ color: "#b45309" }}>None</span> : c.adminCount}</td>
                      <td>{c.status === "ACTIVE" ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
