import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "../api";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";

/** Super-admin: one club's details, status and admins (L-03). */
export default function AdminClubPage() {
  const { id } = useParams();
  const { refreshSession } = useAuth();
  const [club, setClub] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({ text: "", error: false });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [confirmLast, setConfirmLast] = useState(null); // userId of the last admin being removed

  const flash = (text, error = false) => setMsg({ text, error });

  function load() {
    apiGet(`/api/auth/admin/clubs/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(c => {
        setClub(c);
        if (c) setForm({ name: c.name, city: c.city ?? "", country: c.country ?? "", contactEmail: c.contactEmail ?? "" });
      })
      .catch(() => setClub(null));
  }
  useEffect(load, [id]);

  // Search users as you type (2+ characters).
  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); return; }
    const timer = setTimeout(() => {
      apiGet(`/api/auth/admin/users?search=${encodeURIComponent(search.trim())}`)
        .then(r => (r.ok ? r.json() : []))
        .then(list => setResults(Array.isArray(list) ? list : []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function save(e) {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
    const res = await apiPatch(`/api/auth/admin/clubs/${id}`, body);
    if (!res.ok) return flash(await errorMessage(res, "Could not save"), true);
    setClub(await res.json());
    flash("Saved.");
  }

  async function setStatus(status) {
    const res = await apiPatch(`/api/auth/admin/clubs/${id}`, { status });
    if (!res.ok) return flash(await errorMessage(res, "Could not change the status"), true);
    setClub(await res.json());
    flash(status === "ACTIVE" ? "Club reactivated." : "Club deactivated: it and its tournaments are hidden.");
  }

  async function appoint(userId) {
    const res = await apiPost(`/api/auth/admin/clubs/${id}/admins`, { userId });
    if (!res.ok) return flash(await errorMessage(res, "Could not appoint"), true);
    setClub(c => ({ ...c, admins: [] })); // reload below
    load();
    setSearch("");
    flash("Admin appointed. They get access the next time their session refreshes.");
    refreshSession(); // in case the super-admin appointed themself
  }

  async function remove(userId, force = false) {
    const res = await apiDelete(`/api/auth/admin/clubs/${id}/admins/${userId}${force ? "?force=true" : ""}`);
    if (!res.ok) {
      const message = await errorMessage(res, "Could not remove");
      if (!force && /last admin/i.test(message)) { setConfirmLast(userId); return; }
      return flash(message, true);
    }
    setConfirmLast(null);
    load();
    flash("Admin removed. They stay in the club as a member.");
  }

  if (club === null) return <div className="page-loading">Club not found.</div>;
  if (!form) return <div className="page-loading">Loading…</div>;

  return (
    <div className="dash-layout">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <Link to="/admin/clubs" className="back-btn">← All clubs</Link>
            <div className="t-detail-title-row">
              <h1 className="dash-title">{club.name}</h1>
              <span className="t-badge" style={{ background: club.status === "ACTIVE" ? "#2d7a4f" : "#6b7280" }}>
                {club.status === "ACTIVE" ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          <div className="t-actions">
            {club.status === "ACTIVE"
              ? <button className="btn btn-ghost" onClick={() => setStatus("INACTIVE")}>Deactivate</button>
              : <button className="btn btn-primary" onClick={() => setStatus("ACTIVE")}>Reactivate</button>}
          </div>
        </div>

        {msg.text && <div className={`alert ${msg.error ? "alert-error" : "alert-success"}`} role="status">{msg.text}</div>}

        {confirmLast && (
          <div className="alert alert-error confirm-banner" role="alertdialog" aria-label="Remove the last admin">
            <span>This is the club's last admin. Without one, nobody can run its tournaments until you appoint someone.</span>
            <div className="confirm-banner-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmLast(null)}>Keep them</button>
              <button className="btn btn-primary btn-sm" onClick={() => remove(confirmLast, true)}>Remove anyway</button>
            </div>
          </div>
        )}

        <section className="dash-section">
          <div className="dash-section-header"><h2>Admins</h2></div>
          <div className="form-card">
            {club.admins.length === 0 ? (
              <p className="form-hint">No admins yet. Appoint someone below so the club can run tournaments.</p>
            ) : (
              <ul className="admin-list">
                {club.admins.map(a => (
                  <li key={a.userId}>
                    <span><strong>{a.name}</strong> <span className="form-hint" style={{ display: "inline" }}>{a.email}</span></span>
                    <button className="btn-withdraw" onClick={() => remove(a.userId)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label htmlFor="search">Appoint an admin</label>
              <input id="search" placeholder="Search by name or email" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {results.length > 0 && (
              <ul className="admin-list">
                {results.map(u => (
                  <li key={u.id}>
                    <span><strong>{u.name}</strong> <span className="form-hint" style={{ display: "inline" }}>{u.email}</span></span>
                    {club.admins.some(a => a.userId === u.id)
                      ? <span className="form-hint" style={{ display: "inline" }}>Already admin</span>
                      : <button className="btn-approve" onClick={() => appoint(u.id)}>Make admin</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="dash-section">
          <div className="dash-section-header"><h2>Details</h2></div>
          <form className="form-card" onSubmit={save} noValidate>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Club name</label>
                <input id="name" name="name" maxLength={100} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="contactEmail">Contact email</label>
                <input id="contactEmail" type="email" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="city">City</label>
                <input id="city" maxLength={100} value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div className="form-group">
                <label htmlFor="country">Country</label>
                <input id="country" maxLength={100} value={form.country} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
        </section>
      </main>
    </div>
  );
}
