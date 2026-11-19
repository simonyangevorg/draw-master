import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, errorMessage } from "../api";
import Sidebar from "../components/Sidebar";
import RulesPicker from "../components/RulesPicker";
import { FORMAT_LABEL, SURFACE_LABEL, CATEGORY_LABEL, UNAVAILABLE_FORMATS, DEFAULT_RULES, rulesSummary, stagesOf, label } from "../constants";

const STEPS = ["Basic Info", "Events", "Match Rules", "Settings"];

const today = () => new Date().toISOString().slice(0, 10);

/** Players a Group + Knockout draw needs: every group >= 3 and > the number advancing (B-10). */
const groupMinimum = (groups, advance) => Number(groups) * Math.max(3, Number(advance) + 1);

/** A sensible group count for the entry size: groups of about 4. */
const suggestedGroups = (max) => (Number(max) <= 8 ? 2 : Number(max) <= 16 ? 4 : 8);

const CATEGORY_NAME = { MEN: "Men's Singles", WOMEN: "Women's Singles", OPEN: "Open Singles" };

/** A new event, named after its category until the organiser renames it. */
const newEvent = (category = "MEN") => ({
  name: CATEGORY_NAME[category], category, drawFormat: "SINGLE_ELIMINATION",
  maxParticipants: 16, minParticipants: 4, numberOfGroups: 4, advancePerGroup: 2,
  groupRules: { ...DEFAULT_RULES }, knockoutRules: { ...DEFAULT_RULES }, finalRules: null,
});

const INITIAL = {
  // Step 1
  clubId: "", name: "", description: "", venue: "", city: "", country: "",
  startDate: "", endDate: "", registrationDeadline: "",
  // Step 2
  events: [newEvent("MEN")],
  surface: "HARD_OUTDOOR", ageGroup: "OPEN",
  // Step 3
  seeded: true,
  // Step 4
  // PUBLIC for now: until players can join clubs (L-05) a CLUB tournament
  // would have nobody able to enter it. The organiser can still pick CLUB.
  visibility: "PUBLIC", requiresApproval: false,
  entryFee: "", prizePool: "", rankingPoints: "",
};

export default function CreateTournamentPage() {
  const { isSuperAdmin, adminClubs } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL);
  // Clubs this user can create for: their admin seats, or every active club for the super-admin.
  const [clubs, setClubs] = useState(adminClubs);

  useEffect(() => {
    if (!isSuperAdmin) return;
    apiGet("/api/auth/admin/clubs")
      .then(r => (r.ok ? r.json() : []))
      .then(all => setClubs((Array.isArray(all) ? all : []).filter(c => c.status === "ACTIVE")))
      .catch(() => {});
  }, [isSuperAdmin]);

  // Rule presets (F-05): the built-ins plus the chosen club's own.
  const [presets, setPresets] = useState([]);
  useEffect(() => {
    apiGet(`/api/tournaments/rule-presets${form.clubId ? `?clubId=${form.clubId}` : ""}`)
      .then(r => (r.ok ? r.json() : []))
      .then(list => setPresets(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [form.clubId]);

  // One club: just use it.
  useEffect(() => {
    if (clubs.length === 1 && !form.clubId) setForm(p => ({ ...p, clubId: clubs[0].id }));
  }, [clubs]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field, value) {
    setForm(p => ({ ...p, [field]: value }));
    setError("");
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    set(name, type === "checkbox" ? checked : value);
  }

  function setEvent(i, field, value) {
    setForm(p => {
      const events = p.events.map((e, j) => {
        if (j !== i) return e;
        const updated = { ...e, [field]: value };
        // Keep the default name in step with the category until it's been changed by hand.
        if (field === "category" && e.name === CATEGORY_NAME[e.category]) updated.name = CATEGORY_NAME[value];
        return updated;
      });
      return { ...p, events };
    });
    setError("");
  }
  function addEvent() {
    const used = new Set(form.events.map(e => e.category));
    const category = ["WOMEN", "MEN", "OPEN"].find(c => !used.has(c)) ?? "OPEN";
    setForm(p => ({ ...p, events: [...p.events, newEvent(category)] }));
  }
  function removeEvent(i) {
    setForm(p => ({ ...p, events: p.events.filter((_, j) => j !== i) }));
  }

  function next() {
    if (!validateStep()) return;
    setStep(s => s + 1);
  }
  function back() { setStep(s => s - 1); }

  function validateStep() {
    if (step === 0) {
      if (!form.clubId) { setError("Choose the club this tournament belongs to."); return false; }
      if (!form.name.trim()) { setError("Tournament name is required."); return false; }
      if (form.name.trim().length > 100) { setError("Keep the name under 100 characters."); return false; }
      if (!form.startDate || !form.endDate) { setError("Start and end dates are required."); return false; }
      if (form.startDate < today()) { setError("The start date can't be in the past."); return false; }
      if (form.endDate < form.startDate) { setError("End date must be on or after the start date."); return false; }
      if (form.registrationDeadline && form.registrationDeadline > form.startDate) {
        setError("Registration must close on or before the start date."); return false;
      }
    }
    if (step === 1) {
      if (!form.events.length) { setError("Add at least one event."); return false; }
      const names = new Set();
      for (const ev of form.events) {
        const name = ev.name.trim();
        if (!name) { setError("Every event needs a name."); return false; }
        if (names.has(name.toLowerCase())) { setError(`Two events are called "${name}".`); return false; }
        names.add(name.toLowerCase());
        if (Number(ev.minParticipants) > Number(ev.maxParticipants)) {
          setError(`${name}: min participants can't be more than max participants.`); return false;
        }
        if (ev.drawFormat === "GROUP_STAGE_KNOCKOUT") {
          const need = groupMinimum(ev.numberOfGroups, ev.advancePerGroup);
          if (need > Number(ev.maxParticipants)) {
            setError(`${name}: ${ev.numberOfGroups} groups sending ${ev.advancePerGroup} through need at least ${need} players, more than the maximum of ${ev.maxParticipants}. Use fewer groups.`);
            return false;
          }
          if (Number(ev.minParticipants) < need) {
            setError(`${name}: ${ev.numberOfGroups} groups sending ${ev.advancePerGroup} through need at least ${need} players: set Min Participants to ${need} or more.`);
            return false;
          }
        }
      }
    }
    setError("");
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { events, seeded, ...rest } = form;
      const payload = {
        ...rest,
        rankingPoints: form.rankingPoints ? Number(form.rankingPoints) : undefined,
        entryFee: form.entryFee ? Number(form.entryFee) : undefined,
        prizePool: form.prizePool ? Number(form.prizePool) : undefined,
        registrationDeadline: form.registrationDeadline || undefined,
        events: events.map(ev => ({
          name: ev.name.trim(),
          category: ev.category,
          drawFormat: ev.drawFormat,
          maxParticipants: Number(ev.maxParticipants),
          minParticipants: Number(ev.minParticipants),
          numberOfGroups: ev.drawFormat === "GROUP_STAGE_KNOCKOUT" ? Number(ev.numberOfGroups) : undefined,
          advancePerGroup: ev.drawFormat === "GROUP_STAGE_KNOCKOUT" ? Number(ev.advancePerGroup) : undefined,
          groupRules: ev.groupRules,
          knockoutRules: ev.knockoutRules,
          finalRules: stagesOf(ev.drawFormat).includes("knockout") ? ev.finalRules : null,
          seeded,
        })),
      };

      const res = await apiPost("/api/tournaments/", payload);

      if (!res.ok) {
        throw new Error(await errorMessage(res, "Failed to create tournament"));
      }

      const created = await res.json();
      navigate(`/tournaments/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dash-layout">
      <Sidebar />

      <main className="dash-main">
        <div className="dash-header">
          <div>
            <Link to="/dashboard" className="back-btn">← Back to Dashboard</Link>
            <h1 className="dash-title">Create Tournament</h1>
          </div>
        </div>

        {/* Step indicator */}
        <div className="steps-bar">
          {STEPS.map((s, i) => (
            <div key={s} className={`step-item ${i === step ? "step-active" : ""} ${i < step ? "step-done" : ""}`}>
              <div className="step-dot">{i < step ? "✓" : i + 1}</div>
              <div className="step-label">{s}</div>
            </div>
          ))}
        </div>

        <div className="form-card">
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            {/* ── Step 0: Basic Info ── */}
            {step === 0 && (
              <div className="form-section">
                <h2 className="form-section-title">Basic Information</h2>
                <div className="form-group">
                  <label htmlFor="clubId">Club *</label>
                  {clubs.length === 0 ? (
                    <p className="form-hint">You aren't an admin of any club yet, so you can't create tournaments.</p>
                  ) : (
                    <select id="clubId" name="clubId" value={form.clubId} onChange={handleChange}>
                      <option value="">Choose a club…</option>
                      {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label>Tournament Name *</label>
                  <input name="name" maxLength={100} value={form.name} onChange={handleChange} placeholder="e.g. Summer Club Open 2026" />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea name="description" value={form.description} onChange={handleChange} rows={3} placeholder="Optional description..." />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Venue</label>
                    <input name="venue" value={form.venue} onChange={handleChange} placeholder="Court name" />
                  </div>
                  <div className="form-group">
                    <label>City</label>
                    <input name="city" value={form.city} onChange={handleChange} placeholder="City" />
                  </div>
                  <div className="form-group">
                    <label>Country</label>
                    <input name="country" value={form.country} onChange={handleChange} placeholder="Country" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Date *</label>
                    <input name="startDate" type="date" min={today()} value={form.startDate} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>End Date *</label>
                    <input name="endDate" type="date" min={form.startDate || today()} value={form.endDate} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Registration Deadline</label>
                    <input name="registrationDeadline" type="date" min={today()} max={form.startDate || undefined} value={form.registrationDeadline} onChange={handleChange} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 1: Events (F-01) ── */}
            {step === 1 && (
              <div className="form-section">
                <h2 className="form-section-title">Events</h2>
                <p className="form-hint" style={{ marginTop: 0, marginBottom: "1rem" }}>
                  A tournament can run several events, each with its own entries and draw. Doubles and mixed doubles are coming soon.
                </p>
                {form.events.map((ev, i) => (
                  <fieldset key={i} className="event-editor">
                    <legend>Event {i + 1}</legend>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor={`ev-name-${i}`}>Event name</label>
                        <input id={`ev-name-${i}`} name="eventName" maxLength={60} value={ev.name} onChange={e => setEvent(i, "name", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`ev-cat-${i}`}>Category</label>
                        <select id={`ev-cat-${i}`} name="category" value={ev.category} onChange={e => setEvent(i, "category", e.target.value)}>
                          {["MEN", "WOMEN", "OPEN"].map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor={`ev-format-${i}`}>Draw Format</label>
                        <select id={`ev-format-${i}`} name="drawFormat" value={ev.drawFormat} onChange={e => setEvent(i, "drawFormat", e.target.value)}>
                          {Object.keys(FORMAT_LABEL).filter(v => !UNAVAILABLE_FORMATS.includes(v)).map(v => (
                            <option key={v} value={v}>{FORMAT_LABEL[v]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor={`ev-max-${i}`}>Max Participants</label>
                        <select id={`ev-max-${i}`} name="maxParticipants" value={ev.maxParticipants} onChange={e => setEvent(i, "maxParticipants", e.target.value)}>
                          {[8, 16, 32, 64].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor={`ev-min-${i}`}>Min Participants</label>
                        <input id={`ev-min-${i}`} name="minParticipants" type="number" min={2} value={ev.minParticipants} onChange={e => setEvent(i, "minParticipants", e.target.value)} />
                      </div>
                      {ev.drawFormat === "GROUP_STAGE_KNOCKOUT" && (
                        <>
                          <div className="form-group">
                            <label htmlFor={`ev-groups-${i}`}>Number of Groups</label>
                            <select id={`ev-groups-${i}`} name="numberOfGroups" value={ev.numberOfGroups} onChange={e => setEvent(i, "numberOfGroups", e.target.value)}>
                              {[2, 3, 4, 6, 8].map(n => <option key={n} value={n}>{n} groups</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label htmlFor={`ev-adv-${i}`}>Advance per Group</label>
                            <select id={`ev-adv-${i}`} name="advancePerGroup" value={ev.advancePerGroup} onChange={e => setEvent(i, "advancePerGroup", e.target.value)}>
                              {[1, 2, 3].map(n => <option key={n} value={n}>{n} player{n > 1 ? "s" : ""}</option>)}
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                    {ev.drawFormat === "GROUP_STAGE_KNOCKOUT" && (
                      <p className="form-hint">
                        Every group needs at least 3 players and more players than it sends through, so this setup needs at
                        least <strong>{groupMinimum(ev.numberOfGroups, ev.advancePerGroup)}</strong> approved players.
                        {Number(ev.numberOfGroups) !== suggestedGroups(ev.maxParticipants) && (
                          <> For up to {ev.maxParticipants} players, <button type="button" className="form-link" onClick={() => setEvent(i, "numberOfGroups", suggestedGroups(ev.maxParticipants))}>
                            use {suggestedGroups(ev.maxParticipants)} groups
                          </button>.</>
                        )}
                      </p>
                    )}
                    {form.events.length > 1 && (
                      <button type="button" className="btn-withdraw" onClick={() => removeEvent(i)}>Remove event</button>
                    )}
                  </fieldset>
                ))}
                {form.events.length < 10 && (
                  <button type="button" className="btn btn-ghost" onClick={addEvent}>+ Add another event</button>
                )}

                <div className="form-row" style={{ marginTop: "1.5rem" }}>
                  <div className="form-group">
                    <label>Surface</label>
                    <select name="surface" value={form.surface} onChange={handleChange}>
                      {Object.keys(SURFACE_LABEL).map(v => <option key={v} value={v}>{SURFACE_LABEL[v]}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Age Group</label>
                    <select name="ageGroup" value={form.ageGroup} onChange={handleChange}>
                      <option value="OPEN">Open</option>
                      <option value="U18">Under 18</option>
                      <option value="U16">Under 16</option>
                      <option value="U14">Under 14</option>
                      <option value="SENIOR_40">Senior 40+</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Match Rules (F-05) ── */}
            {step === 2 && (
              <div className="form-section">
                <h2 className="form-section-title">Match Rules</h2>
                <p className="form-hint" style={{ marginTop: 0, marginBottom: "1rem" }}>
                  Pick a preset or set your own, per stage. Each event keeps its own copy: changing a preset later doesn't
                  change this tournament. Rules lock once an event's draw is made.
                </p>
                {form.events.map((ev, i) => (
                  <div key={i} className="stage-rules">
                    <h3>{ev.name || `Event ${i + 1}`} <span className="form-hint" style={{ display: "inline" }}>({label(FORMAT_LABEL, ev.drawFormat)})</span></h3>
                    {stagesOf(ev.drawFormat).includes("group") && (
                      <RulesPicker
                        label={ev.drawFormat === "ROUND_ROBIN" ? "Matches" : "Group matches"}
                        name="groupPreset" value={ev.groupRules} presets={presets}
                        onChange={r => setEvent(i, "groupRules", r)}
                        clubId={form.clubId} canSavePreset={isSuperAdmin || adminClubs.some(c => c.id === form.clubId)}
                        onPresetSaved={p => setPresets(list => [...list, p])}
                      />
                    )}
                    {stagesOf(ev.drawFormat).includes("knockout") && (
                      <>
                        <RulesPicker
                          label={ev.drawFormat === "GROUP_STAGE_KNOCKOUT" ? "Knockout matches" : "Matches"}
                          name="knockoutPreset" value={ev.knockoutRules} presets={presets}
                          onChange={r => setEvent(i, "knockoutRules", r)}
                          clubId={form.clubId} canSavePreset={isSuperAdmin || adminClubs.some(c => c.id === form.clubId)}
                          onPresetSaved={p => setPresets(list => [...list, p])}
                        />
                        <label className="toggle-label" style={{ marginBottom: ".75rem" }}>
                          <input type="checkbox" name="finalOverride" checked={!!ev.finalRules}
                            onChange={e => setEvent(i, "finalRules", e.target.checked ? { ...ev.knockoutRules } : null)} />
                          <span>Different rules for the final</span>
                        </label>
                        {ev.finalRules && (
                          <RulesPicker
                            label="Final" name="finalPreset" value={ev.finalRules} presets={presets}
                            onChange={r => setEvent(i, "finalRules", r)}
                            clubId={form.clubId} canSavePreset={isSuperAdmin || adminClubs.some(c => c.id === form.clubId)}
                            onPresetSaved={p => setPresets(list => [...list, p])}
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
                <div className="form-group">
                  <label>Seeding</label>
                  <div className="toggle-group">
                    <label className="toggle-label">
                      <input type="checkbox" name="seeded" checked={form.seeded} onChange={handleChange} />
                      <span>Use player rankings to seed the draw</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Settings ── */}
            {step === 3 && (
              <div className="form-section">
                <h2 className="form-section-title">Access & Prizes</h2>
                <div className="form-group">
                  <label>Visibility & Registration</label>
                  <div className="toggle-group">
                    <label className="toggle-label">
                      <input type="radio" name="visibility" value="PUBLIC" checked={form.visibility === "PUBLIC"} onChange={handleChange} />
                      <span>Everyone can see it and sign up</span>
                    </label>
                    <label className="toggle-label">
                      <input type="radio" name="visibility" value="CLUB" checked={form.visibility === "CLUB"} onChange={handleChange} />
                      <span>Only members of the club</span>
                    </label>
                    <label className="toggle-label">
                      <input type="checkbox" name="requiresApproval" checked={form.requiresApproval} onChange={handleChange} />
                      <span>Require organiser approval for applications</span>
                    </label>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Entry Fee ($) <span className="optional">optional</span></label>
                    <input name="entryFee" type="number" min={0} step={0.01} value={form.entryFee} onChange={handleChange} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label>Prize Pool ($) <span className="optional">optional</span></label>
                    <input name="prizePool" type="number" min={0} step={0.01} value={form.prizePool} onChange={handleChange} placeholder="0.00" />
                  </div>
                  <div className="form-group">
                    <label>Ranking Points <span className="optional">optional</span></label>
                    <input name="rankingPoints" type="number" min={0} value={form.rankingPoints} onChange={handleChange} placeholder="0" />
                  </div>
                </div>

                {/* Summary */}
                <div className="summary-box">
                  <h3>Summary</h3>
                  <div className="summary-grid">
                    <span>Name</span><span><strong>{form.name}</strong></span>
                    <span>Dates</span><span>{form.startDate} → {form.endDate}</span>
                    <span>Events</span><span>{form.events.map(ev => `${ev.name} (${label(FORMAT_LABEL, ev.drawFormat)}, up to ${ev.maxParticipants})`).join("; ")}</span>
                    <span>Surface</span><span>{label(SURFACE_LABEL, form.surface)}</span>
                    <span>Rules</span><span>{form.events.map(ev => `${ev.name}: ${rulesSummary(stagesOf(ev.drawFormat).includes("knockout") ? ev.knockoutRules : ev.groupRules)}`).join("; ")}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="form-nav">
              {step > 0 && (
                <button type="button" className="btn btn-ghost" onClick={back}>← Back</button>
              )}
              {step < STEPS.length - 1 && (
                <button type="button" className="btn btn-primary" onClick={next}>Continue →</button>
              )}
              {step === STEPS.length - 1 && (
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Creating…" : "🏆 Create Tournament"}
                </button>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
