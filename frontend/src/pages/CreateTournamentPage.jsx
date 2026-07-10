import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiPost } from "../api";

const STEPS = ["Basic Info", "Format", "Match Rules", "Settings"];

const INITIAL = {
  // Step 1
  name: "", description: "", venue: "", city: "", country: "",
  startDate: "", endDate: "", registrationDeadline: "",
  // Step 2
  tournamentType: "SINGLES_MEN", drawFormat: "SINGLE_ELIMINATION",
  surface: "HARD_OUTDOOR", ageGroup: "OPEN",
  maxParticipants: 16, minParticipants: 4,
  numberOfGroups: 4, advancePerGroup: 2,
  // Step 3
  setsToWin: 2, gamesPerSet: 6, tiebreakAt: 6,
  finalSetTiebreak: false, noAd: false, seeded: true,
  // Step 4
  isPublic: true, requiresApproval: false,
  entryFee: "", prizePool: "", rankingPoints: "",
};

export default function CreateTournamentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL);
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

  function next() {
    if (!validateStep()) return;
    setStep(s => s + 1);
  }
  function back() { setStep(s => s - 1); }

  function validateStep() {
    if (step === 0) {
      if (!form.name) { setError("Tournament name is required."); return false; }
      if (!form.startDate || !form.endDate) { setError("Start and end dates are required."); return false; }
      if (form.endDate < form.startDate) { setError("End date must be after start date."); return false; }
    }
    setError("");
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        maxParticipants: Number(form.maxParticipants),
        minParticipants: Number(form.minParticipants),
        setsToWin: Number(form.setsToWin),
        gamesPerSet: Number(form.gamesPerSet),
        tiebreakAt: Number(form.tiebreakAt),
        rankingPoints: form.rankingPoints ? Number(form.rankingPoints) : undefined,
        entryFee: form.entryFee ? Number(form.entryFee) : undefined,
        prizePool: form.prizePool ? Number(form.prizePool) : undefined,
        registrationDeadline: form.registrationDeadline || undefined,
        numberOfGroups: form.drawFormat === "GROUP_STAGE_KNOCKOUT" ? Number(form.numberOfGroups) : undefined,
        advancePerGroup: form.drawFormat === "GROUP_STAGE_KNOCKOUT" ? Number(form.advancePerGroup) : undefined,
      };

      const res = await apiPost("/api/tournaments/", payload);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(Array.isArray(err.message) ? err.message.join(", ") : err.message || "Failed to create tournament");
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
      {/* Sidebar */}
      <aside className="sidebar">
        <Link to="/" className="sidebar-logo">
          <img src="/logo.png" alt="FPTC" className="sidebar-logo-img" />
        </Link>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className="sidebar-link"><span>🏠</span> Dashboard</Link>
          <Link to="/tournaments/new" className="sidebar-link sidebar-link-active"><span>➕</span> New Tournament</Link>
          <Link to="/tournaments" className="sidebar-link"><span>🏆</span> Tournaments</Link>
        </nav>
      </aside>

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
                  <label>Tournament Name *</label>
                  <input name="name" value={form.name} onChange={handleChange} placeholder="e.g. FPTC Summer Open 2026" />
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
                    <input name="startDate" type="date" value={form.startDate} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>End Date *</label>
                    <input name="endDate" type="date" value={form.endDate} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Registration Deadline</label>
                    <input name="registrationDeadline" type="date" value={form.registrationDeadline} onChange={handleChange} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 1: Format ── */}
            {step === 1 && (
              <div className="form-section">
                <h2 className="form-section-title">Tournament Format</h2>
                <div className="form-row">
                  <div className="form-group">
                    <label>Tournament Type</label>
                    <select name="tournamentType" value={form.tournamentType} onChange={handleChange}>
                      <option value="SINGLES_MEN">Singles Men</option>
                      <option value="SINGLES_WOMEN">Singles Women</option>
                      <option value="DOUBLES_MEN">Doubles Men</option>
                      <option value="DOUBLES_WOMEN">Doubles Women</option>
                      <option value="MIXED_DOUBLES">Mixed Doubles</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Draw Format</label>
                    <select name="drawFormat" value={form.drawFormat} onChange={handleChange}>
                      <option value="SINGLE_ELIMINATION">Single Elimination</option>
                      <option value="DOUBLE_ELIMINATION">Double Elimination</option>
                      <option value="ROUND_ROBIN">Round Robin</option>
                      <option value="GROUP_STAGE_KNOCKOUT">Group Stage + Knockout</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Surface</label>
                    <select name="surface" value={form.surface} onChange={handleChange}>
                      <option value="CLAY">Clay (Outdoor)</option>
                      <option value="HARD_OUTDOOR">Hard (Outdoor)</option>
                      <option value="HARD_INDOOR">Hard (Indoor)</option>
                      <option value="GRASS">Grass</option>
                      <option value="CARPET">Carpet (Indoor)</option>
                      <option value="ACRYLIC">Acrylic</option>
                      <option value="ARTIFICIAL_CLAY">Artificial Clay</option>
                      <option value="ARTIFICIAL_GRASS">Artificial Grass</option>
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
                <div className="form-row">
                  <div className="form-group">
                    <label>Max Participants</label>
                    <select name="maxParticipants" value={form.maxParticipants} onChange={handleChange}>
                      <option value={8}>8</option>
                      <option value={16}>16</option>
                      <option value={32}>32</option>
                      <option value={64}>64</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Min Participants</label>
                    <input name="minParticipants" type="number" min={2} value={form.minParticipants} onChange={handleChange} />
                  </div>
                </div>
                {form.drawFormat === "GROUP_STAGE_KNOCKOUT" && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Number of Groups</label>
                      <select name="numberOfGroups" value={form.numberOfGroups} onChange={handleChange}>
                        {[2,3,4,6,8].map(n => <option key={n} value={n}>{n} groups</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Advance per Group</label>
                      <select name="advancePerGroup" value={form.advancePerGroup} onChange={handleChange}>
                        {[1,2,3].map(n => <option key={n} value={n}>{n} player{n > 1 ? "s" : ""}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Match Rules ── */}
            {step === 2 && (
              <div className="form-section">
                <h2 className="form-section-title">Match Rules</h2>
                <div className="form-row">
                  <div className="form-group">
                    <label>Sets to Win</label>
                    <select name="setsToWin" value={form.setsToWin} onChange={handleChange}>
                      <option value={1}>Best of 1 set</option>
                      <option value={2}>Best of 3 sets</option>
                      <option value={3}>Best of 5 sets</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Games per Set</label>
                    <select name="gamesPerSet" value={form.gamesPerSet} onChange={handleChange}>
                      <option value={4}>4 games</option>
                      <option value={6}>6 games</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tiebreak at</label>
                    <input name="tiebreakAt" type="number" min={4} max={8} value={form.tiebreakAt} onChange={handleChange} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Seeding</label>
                  <div className="toggle-group">
                    <label className="toggle-label">
                      <input type="checkbox" name="seeded" checked={form.seeded} onChange={handleChange} />
                      <span>Use player rankings to seed the draw</span>
                    </label>
                    <label className="toggle-label">
                      <input type="checkbox" name="finalSetTiebreak" checked={form.finalSetTiebreak} onChange={handleChange} />
                      <span>Final set tiebreak (champion tiebreak) instead of full set</span>
                    </label>
                    <label className="toggle-label">
                      <input type="checkbox" name="noAd" checked={form.noAd} onChange={handleChange} />
                      <span>No-advantage scoring</span>
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
                      <input type="checkbox" name="isPublic" checked={form.isPublic} onChange={handleChange} />
                      <span>Public tournament (visible to players outside your club)</span>
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
                    <span>Type</span><span>{form.tournamentType?.replace(/_/g, " ")}</span>
                    <span>Format</span><span>{form.drawFormat?.replace(/_/g, " ")}</span>
                    <span>Surface</span><span>{form.surface}</span>
                    <span>Max Players</span><span>{form.maxParticipants}</span>
                    <span>Sets to Win</span><span>{form.setsToWin === 1 ? "Best of 1" : form.setsToWin === 2 ? "Best of 3" : "Best of 5"}</span>
                    <span>Games/Set</span><span>{form.gamesPerSet}</span>
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
