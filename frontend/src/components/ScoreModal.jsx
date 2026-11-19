import React, { useMemo, useState } from "react";
import { validateScore, formatScore } from "../scoreRules";
import { DEFAULT_RULES, rulesSummary } from "../constants";

const OUTCOMES = [
  { value: "COMPLETED", label: "Played" },
  { value: "RETIRED",   label: "Retired" },
  { value: "WALKOVER",  label: "Walkover" },
  { value: "DEFAULT",   label: "Default" },
];

const toInt = (v) => (v === "" || v == null ? NaN : Number(v));

/**
 * Enter a match result (F-06), checked live with the same rules the API
 * applies (scoreRules.js mirrors the server). Shows the match's rules, takes
 * tiebreak points for 7-6 sets, treats the deciding set as a 10-point match
 * tiebreak when the rules say so, and records a retirement, walkover or
 * default with the winner picked by hand.
 *
 * onSave(sets, winnerId, outcome)
 */
export default function ScoreModal({ match, playerLabel, onSave, onClose }) {
  const rules = match.rules ?? DEFAULT_RULES;
  const need = Math.ceil(rules.bestOf / 2);
  const p1 = match.participant1Id;
  const p2 = match.participant2Id;

  const [outcome, setOutcome] = useState("COMPLETED");
  const [rows, setRows] = useState(Array.from({ length: need }, () => ({ p1: "", p2: "", tb: "" })));
  const [pickedWinner, setPickedWinner] = useState("");
  const [saving, setSaving] = useState(false);

  // Rows that have both numbers, in the shape the validator and API take.
  const sets = useMemo(() => rows
    .filter(r => !Number.isNaN(toInt(r.p1)) && !Number.isNaN(toInt(r.p2)))
    .map(r => ({ p1: toInt(r.p1), p2: toInt(r.p2), ...(r.tb !== "" && !Number.isNaN(toInt(r.tb)) ? { tb: toInt(r.tb) } : {}) })),
  [rows]);
  const incomplete = outcome !== "WALKOVER" && rows.some(r => (r.p1 === "") !== (r.p2 === ""));
  const check = useMemo(() => validateScore(rules, outcome === "WALKOVER" ? [] : sets, outcome), [rules, sets, outcome]);

  // Played to the end: the score names the winner. Otherwise the organiser does.
  const scoreWinner = check.ok && check.winner ? (check.winner === 1 ? p1 : p2) : "";
  const winnerId = outcome === "COMPLETED" ? scoreWinner : pickedWinner;
  const canSave = check.ok && !incomplete && !!winnerId && !saving;

  // Is row i a set tiebreak (T+1 to T) or the deciding match tiebreak?
  const T = rules.tiebreakAt;
  const isTiebreakSet = (r) => {
    const a = toInt(r.p1), b = toInt(r.p2);
    return Math.max(a, b) === T + 1 && Math.min(a, b) === T;
  };
  const isMatchTiebreakRow = (i) => rules.bestOf > 1 && rules.decidingSet === "MATCH_TIEBREAK_10" && i === rules.bestOf - 1;

  function update(i, key, value) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    await onSave(outcome === "WALKOVER" ? [] : check.sets, winnerId, outcome);
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" role="dialog" aria-label="Enter match score" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Enter Match Score</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="score-players">
          <span className="score-player-name">{playerLabel(p1)}</span>
          <span className="score-vs">vs</span>
          <span className="score-player-name">{playerLabel(p2)}</span>
        </div>
        <p className="score-rules">{rulesSummary(rules)}</p>

        <div className="score-outcomes" role="radiogroup" aria-label="How the match ended">
          {OUTCOMES.map(o => (
            <button key={o.value} type="button" role="radio" aria-checked={outcome === o.value}
              className={`score-outcome${outcome === o.value ? " active" : ""}`}
              onClick={() => setOutcome(o.value)}>{o.label}</button>
          ))}
        </div>

        {outcome !== "WALKOVER" && (
          <>
            <div className="score-sets">
              {rows.map((r, i) => {
                const mtb = isMatchTiebreakRow(i);
                return (
                  <div key={i} className="score-set-row">
                    <span className="score-set-label">{mtb ? "Match TB" : `Set ${i + 1}`}</span>
                    <input className="score-input" type="number" inputMode="numeric" min="0" max={mtb ? 99 : rules.gamesPerSet + 1}
                      aria-label={`${mtb ? "Match tiebreak" : `Set ${i + 1}`}, ${playerLabel(p1)}`}
                      value={r.p1} onChange={e => update(i, "p1", e.target.value)} placeholder="0" />
                    <span className="score-dash">–</span>
                    <input className="score-input" type="number" inputMode="numeric" min="0" max={mtb ? 99 : rules.gamesPerSet + 1}
                      aria-label={`${mtb ? "Match tiebreak" : `Set ${i + 1}`}, ${playerLabel(p2)}`}
                      value={r.p2} onChange={e => update(i, "p2", e.target.value)} placeholder="0" />
                    {!mtb && isTiebreakSet(r) && (
                      <input className="score-input score-tb" type="number" inputMode="numeric" min="0"
                        aria-label={`Set ${i + 1} tiebreak: loser's points`} title="Tiebreak: the loser's points"
                        value={r.tb} onChange={e => update(i, "tb", e.target.value)} placeholder="TB" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="score-set-controls">
              {rows.length < rules.bestOf && (
                <button className="btn-add-set" onClick={() => setRows(rs => [...rs, { p1: "", p2: "", tb: "" }])}>+ Add set</button>
              )}
              {rows.length > 1 && (
                <button className="btn-remove-set" onClick={() => setRows(rs => rs.slice(0, -1))}>– Remove set</button>
              )}
            </div>
          </>
        )}

        {outcome === "COMPLETED" ? (
          scoreWinner && <div className="score-winner-line">Winner: <strong>{playerLabel(scoreWinner)}</strong></div>
        ) : (
          <div className="score-winner">
            <div className="score-winner-label">
              {outcome === "RETIRED" ? "Winner (the player who didn't retire)" : outcome === "WALKOVER" ? "Winner (the player who turned up)" : "Winner"}
            </div>
            <div className="score-winner-btns">
              {[p1, p2].map(pid => (
                <button key={pid} className={`score-winner-btn${pickedWinner === pid ? " active" : ""}`} onClick={() => setPickedWinner(pid)}>
                  {playerLabel(pid)}
                </button>
              ))}
            </div>
          </div>
        )}

        {!check.ok && (sets.length > 0 || outcome !== "COMPLETED") && <div className="score-error" role="alert">{check.error}</div>}
        {incomplete && <div className="score-error" role="alert">Fill in both scores of every set you've started.</div>}
        {check.ok && winnerId && <div className="score-preview">{formatScore(check.sets, outcome)}</div>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!canSave}>Save & Advance Winner</button>
        </div>
      </div>
    </div>
  );
}
