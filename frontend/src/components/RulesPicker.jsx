import React, { useState } from "react";
import { apiPost, errorMessage } from "../api";
import { rulesSummary, sameRules } from "../constants";

/**
 * Pick one stage's match rules (F-05): a preset, or custom values. Club
 * admins can save custom values as a club preset. The event keeps a copy of
 * the rules, so editing the preset later never changes this event.
 *
 * value, onChange(ruleSet), presets (built-in + club), name (form field name
 * for the preset select, e.g. "knockoutPreset"), clubId + canSavePreset +
 * onPresetSaved for saving.
 */
export default function RulesPicker({ label, value, onChange, presets, name, clubId, canSavePreset, onPresetSaved }) {
  const matching = presets.find(p => sameRules(p.rules, value));
  const [custom, setCustom] = useState(!matching);
  const [saveName, setSaveName] = useState("");
  const [msg, setMsg] = useState({ text: "", error: false });

  const selectValue = custom || !matching ? "custom" : matching.id;

  function pick(e) {
    if (e.target.value === "custom") { setCustom(true); return; }
    const preset = presets.find(p => p.id === e.target.value);
    if (preset) { setCustom(false); onChange({ ...preset.rules }); }
  }

  function set(field, raw) {
    const v = field === "noAd" ? raw : field === "decidingSet" ? raw : Number(raw);
    const next = { ...value, [field]: v };
    // A tiebreak can't come later than the set's length; keep it in step.
    if (field === "gamesPerSet" && next.tiebreakAt > v) next.tiebreakAt = v;
    if (field === "gamesPerSet" && value.tiebreakAt === value.gamesPerSet) next.tiebreakAt = v;
    if (field === "bestOf" && v === 1) next.decidingSet = "FULL";
    onChange(next);
  }

  async function savePreset() {
    if (!saveName.trim()) { setMsg({ text: "Give the preset a name.", error: true }); return; }
    const res = await apiPost("/api/tournaments/rule-presets", { clubId, name: saveName.trim(), rules: value });
    if (!res.ok) { setMsg({ text: await errorMessage(res, "Could not save the preset"), error: true }); return; }
    setSaveName("");
    setMsg({ text: "Saved as a club preset.", error: false });
    onPresetSaved?.(await res.json());
    setCustom(false);
  }

  return (
    <div className="rules-picker">
      <div className="form-group">
        <label>{label}</label>
        <select name={name} value={selectValue} onChange={pick}>
          {presets.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.clubId ? " (club)" : ""}</option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        {!custom && <small className="form-hint">{rulesSummary(value)}</small>}
      </div>

      {(custom || !matching) && (
        <div className="rules-custom">
          <div className="form-row">
            <div className="form-group">
              <label>Best of</label>
              <select value={value.bestOf} onChange={e => set("bestOf", e.target.value)}>
                {[1, 3, 5].map(n => <option key={n} value={n}>{n} set{n > 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Games per set</label>
              <select value={value.gamesPerSet} onChange={e => set("gamesPerSet", e.target.value)}>
                <option value={4}>4 (short sets)</option>
                <option value={6}>6</option>
                <option value={8}>8 (pro set)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Tiebreak at</label>
              <select value={value.tiebreakAt} onChange={e => set("tiebreakAt", e.target.value)}>
                {Array.from({ length: value.gamesPerSet }, (_, i) => i + 1).reverse().map(n => (
                  <option key={n} value={n}>{n}-{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Deciding set</label>
              <select value={value.decidingSet} onChange={e => set("decidingSet", e.target.value)} disabled={value.bestOf === 1}>
                <option value="FULL">Full set</option>
                <option value="MATCH_TIEBREAK_10">Match tiebreak to 10</option>
              </select>
            </div>
            <div className="form-group">
              <label className="toggle-label" style={{ marginTop: "1.6rem" }}>
                <input type="checkbox" checked={value.noAd} onChange={e => set("noAd", e.target.checked)} />
                <span>No-ad scoring</span>
              </label>
            </div>
          </div>
          {canSavePreset && clubId && (
            <div className="rules-save">
              <input placeholder="Preset name" maxLength={60} value={saveName} onChange={e => setSaveName(e.target.value)} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={savePreset}>Save as club preset</button>
            </div>
          )}
          {msg.text && <small className="form-hint" style={{ color: msg.error ? "#b91c1c" : undefined }}>{msg.text}</small>}
        </div>
      )}
    </div>
  );
}
