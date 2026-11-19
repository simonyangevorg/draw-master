import React, { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "../api";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_RULES, rulesSummary } from "../constants";
import Sidebar from "../components/Sidebar";
import RulesPicker from "../components/RulesPicker";

/**
 * A club admin's match-rule presets (F-05). Built-in presets are listed for
 * reference and can't be changed. Changing a preset never changes an event
 * already set up with it: events keep their own copy.
 */
export default function ClubPresetsPage() {
  const { adminClubs, isSuperAdmin } = useAuth();
  const [clubId, setClubId] = useState(adminClubs[0]?.id ?? "");
  const [presets, setPresets] = useState([]);
  const [draft, setDraft] = useState({ name: "", rules: { ...DEFAULT_RULES } });
  const [editing, setEditing] = useState(null); // preset being edited: { id, name, rules }
  const [msg, setMsg] = useState({ text: "", error: false });
  const flash = (text, error = false) => setMsg({ text, error });

  function load() {
    if (!clubId) return;
    apiGet(`/api/tournaments/rule-presets?clubId=${clubId}`)
      .then(r => (r.ok ? r.json() : []))
      .then(list => setPresets(Array.isArray(list) ? list : []))
      .catch(() => {});
  }
  useEffect(load, [clubId]);

  async function create(e) {
    e.preventDefault();
    if (!draft.name.trim()) return flash("Give the preset a name.", true);
    const res = await apiPost("/api/tournaments/rule-presets", { clubId, name: draft.name.trim(), rules: draft.rules });
    if (!res.ok) return flash(await errorMessage(res, "Could not save the preset"), true);
    setDraft({ name: "", rules: { ...DEFAULT_RULES } });
    flash("Preset saved.");
    load();
  }

  async function saveEdit() {
    const res = await apiPatch(`/api/tournaments/rule-presets/${editing.id}`, { name: editing.name.trim(), rules: editing.rules });
    if (!res.ok) return flash(await errorMessage(res, "Could not save the preset"), true);
    setEditing(null);
    flash("Preset updated. Tournaments already set up with it keep their own rules.");
    load();
  }

  async function remove(id) {
    const res = await apiDelete(`/api/tournaments/rule-presets/${id}`);
    if (!res.ok) return flash(await errorMessage(res, "Could not delete the preset"), true);
    flash("Preset deleted.");
    load();
  }

  const builtIn = presets.filter(p => !p.clubId);
  const own = presets.filter(p => p.clubId);

  return (
    <div className="dash-layout">
      <Sidebar />
      <main className="dash-main">
        <div className="dash-header">
          <div>
            <h1 className="dash-title">Match rule presets</h1>
            <p className="dash-sub">Your club's ready-made rules, offered when you set up a tournament.</p>
          </div>
        </div>

        {adminClubs.length === 0 ? (
          <div className="dash-empty">{isSuperAdmin ? "Club presets belong to a club: make yourself an admin of one first." : "Only club admins have presets."}</div>
        ) : (
          <>
            {adminClubs.length > 1 && (
              <div className="form-group" style={{ maxWidth: 320 }}>
                <label htmlFor="club">Club</label>
                <select id="club" value={clubId} onChange={e => setClubId(e.target.value)}>
                  {adminClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {msg.text && <div className={`alert ${msg.error ? "alert-error" : "alert-success"}`} role="status">{msg.text}</div>}

            <section className="dash-section">
              <div className="dash-section-header"><h2>Your presets</h2></div>
              <div className="form-card">
                {own.length === 0 && <p className="form-hint">No club presets yet. Add one below.</p>}
                <ul className="admin-list">
                  {own.map(p => (
                    <li key={p.id}>
                      {editing?.id === p.id ? (
                        <div style={{ flex: 1 }}>
                          <div className="form-group">
                            <label>Name</label>
                            <input value={editing.name} maxLength={60} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))} />
                          </div>
                          <RulesPicker label="Rules" value={editing.rules} presets={[]} name="editRules"
                            onChange={r => setEditing(x => ({ ...x, rules: r }))} />
                          <div style={{ display: "flex", gap: ".5rem" }}>
                            <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span><strong>{p.name}</strong><br /><span className="form-hint" style={{ display: "inline" }}>{rulesSummary(p.rules)}</span></span>
                          <span style={{ display: "flex", gap: ".4rem" }}>
                            <button className="btn-approve" onClick={() => setEditing({ id: p.id, name: p.name, rules: { ...p.rules } })}>Edit</button>
                            <button className="btn-withdraw" onClick={() => remove(p.id)}>Delete</button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="dash-section">
              <div className="dash-section-header"><h2>Add a preset</h2></div>
              <form className="form-card" onSubmit={create} noValidate>
                <div className="form-group" style={{ maxWidth: 320 }}>
                  <label htmlFor="presetName">Preset name</label>
                  <input id="presetName" maxLength={60} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. Club night: Fast4" />
                </div>
                <RulesPicker label="Rules" value={draft.rules} presets={[]} name="newRules"
                  onChange={r => setDraft(d => ({ ...d, rules: r }))} />
                <button type="submit" className="btn btn-primary">Add preset</button>
              </form>
            </section>

            <section className="dash-section">
              <div className="dash-section-header"><h2>Built in</h2></div>
              <div className="form-card">
                <ul className="admin-list">
                  {builtIn.map(p => (
                    <li key={p.id}><span><strong>{p.name}</strong><br /><span className="form-hint" style={{ display: "inline" }}>{rulesSummary(p.rules)}</span></span></li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
