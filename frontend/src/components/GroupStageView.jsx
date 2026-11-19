import React, { useState } from "react";
import ScoreModal from "./ScoreModal";
import { formatScore } from "../scoreRules";
import BracketView from "./BracketView";

// ── Standings computation ─────────────────────────────────────────────────────
function computeStandings(members, matches) {
  const stats = {};
  for (const p of members) stats[p.id] = { pid: p.id, w: 0, l: 0, gw: 0, gl: 0 };
  for (const m of matches) {
    if (m.status !== "COMPLETED" && m.status !== "WALKOVER") continue;
    const s1 = stats[m.participant1Id];
    const s2 = stats[m.participant2Id];
    if (!s1 || !s2) continue;
    if (m.sets?.length) {
      for (const set of m.sets) {
        s1.gw += set.p1; s1.gl += set.p2;
        s2.gw += set.p2; s2.gl += set.p1;
      }
    }
    if (m.winnerId === m.participant1Id)      { s1.w++; s2.l++; }
    else if (m.winnerId === m.participant2Id) { s2.w++; s1.l++; }
  }
  return Object.values(stats).sort((a, b) =>
    b.w - a.w || (b.gw - b.gl) - (a.gw - a.gl)
  );
}

// ── Single group block ────────────────────────────────────────────────────────
function GroupPool({ group, matches, pMap, advancePerGroup, isOrganiser, setsToWin, onScore }) {
  const [activeModal, setActiveModal] = useState(null);

  const members    = (group.participantIds ?? []).map(id => pMap[id]).filter(Boolean);
  const standings  = computeStandings(members, matches);
  const scheduled  = matches.filter(m => m.status === "SCHEDULED" || m.status === "IN_PROGRESS");

  function label(p) {
    if (!p) return "?";
    return p.seed ? `Seed ${p.seed}` : p.id.slice(0, 5) + "…";
  }

  function getMatch(rowId, colId) {
    return matches.find(m =>
      (m.participant1Id === rowId && m.participant2Id === colId) ||
      (m.participant1Id === colId && m.participant2Id === rowId)
    );
  }

  function cellContent(match, rowId) {
    if (match?.outcome === "WALKOVER") return "w/o";
    if (!match?.sets?.length) return null;
    const isP1 = match.participant1Id === rowId;
    // From this player's side, in the F-06 notation: 7-6(5) 4-6 [10-8], ret.
    const flipped = match.sets.map(s => (isP1 ? s : { ...s, p1: s.p2, p2: s.p1 }));
    return formatScore(flipped, match.outcome ?? "COMPLETED");
  }

  return (
    <div className="gs-pool-block">
      <div className="gs-pool-tables">

        {/* ── Matrix grid ── */}
        <div className="gs-matrix-wrap">
          <table className="gs-matrix">
            <thead>
              <tr>
                <th className="gs-matrix-corner">{group.name}</th>
                {members.map(p => (
                  <th key={p.id} className="gs-matrix-col-hdr">{label(p)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(rowP => (
                <tr key={rowP.id}>
                  <td className="gs-matrix-row-hdr">{label(rowP)}</td>
                  {members.map(colP => {
                    if (rowP.id === colP.id) {
                      return <td key={colP.id} className="gs-matrix-diagonal" />;
                    }
                    const match   = getMatch(rowP.id, colP.id);
                    const isDone  = match?.status === "COMPLETED" || match?.status === "WALKOVER";
                    const canScore = isOrganiser && match && !isDone;
                    const content = isDone ? cellContent(match, rowP.id) : null;
                    const isWin   = isDone && match?.winnerId === rowP.id;
                    const isLoss  = isDone && match?.winnerId && match.winnerId !== rowP.id;

                    return (
                      <td
                        key={colP.id}
                        className={[
                          "gs-matrix-cell",
                          isWin  ? "gs-cell-win"   : "",
                          isLoss ? "gs-cell-loss"  : "",
                          canScore ? "gs-cell-playable" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={canScore ? () => setActiveModal(match) : undefined}
                        title={canScore ? "Click to score" : undefined}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Standings ── */}
        <table className="gs-standings-table">
          <thead>
            <tr>
              <th></th>
              <th>Matches</th>
              <th>Games</th>
              <th>Position</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.pid} className={i < advancePerGroup ? "gs-row-advance" : ""}>
                <td className="gs-std-name">
                  {i < advancePerGroup && <span className="gs-advance-dot" title="Advances to knockout" />}
                  {label(pMap[s.pid])}
                </td>
                <td className="gs-std-stat">{s.w}–{s.l}</td>
                <td className="gs-std-stat">{s.gw}–{s.gl}</td>
                <td className="gs-std-pos">{i + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Scheduled matches ── */}
      {scheduled.length > 0 && (
        <div className="gs-scheduled">
          <div className="gs-scheduled-title">Scheduled Matches</div>
          <div className="gs-sched-list">
            {scheduled.map(m => {
              const canScore = isOrganiser;
              return (
                <div
                  key={m.id}
                  className={`gs-sched-row${canScore ? " gs-sched-clickable" : ""}`}
                  onClick={canScore ? () => setActiveModal(m) : undefined}
                  title={canScore ? "Click to score" : undefined}
                >
                  <span className="gs-sched-player">{label(pMap[m.participant1Id])}</span>
                  <span className="gs-sched-vs">vs</span>
                  <span className="gs-sched-player">{label(pMap[m.participant2Id])}</span>
                  {m.status === "IN_PROGRESS" && <span className="gs-sched-live">LIVE</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Score modal ── */}
      {activeModal && (
        <ScoreModal
          match={activeModal}
          playerLabel={pid => { const p = pMap[pid]; return p?.seed ? `Seed ${p.seed}` : pid ? pid.slice(0, 6) + "…" : "?"; }}
          onSave={async (sets, winnerId, outcome) => {
            const m = activeModal;
            setActiveModal(null);
            await onScore(m.id, sets, winnerId, outcome);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function GroupStageView({ tournament, draw, participants, isOrganiser, onScore }) {
  const pMap          = Object.fromEntries(participants.map(p => [p.id, p]));
  const groups        = (tournament.groups ?? []).slice().sort((a, b) => a.position - b.position);
  const advancePerGroup = tournament.advancePerGroup ?? 2;
  const setsToWin     = 2; // fallback only: each match carries its own rules (F-05)

  const groupMatches    = draw.filter(m => m.stage === "GROUP");
  const knockoutMatches = draw.filter(m => m.stage === "KNOCKOUT");

  return (
    <div className="gs-wrap">
      <div className="gs-pools-list">
        {groups.map(group => (
          <GroupPool
            key={group.id}
            group={group}
            matches={groupMatches.filter(m => m.groupId === group.id)}
            pMap={pMap}
            advancePerGroup={advancePerGroup}
            isOrganiser={isOrganiser}
            setsToWin={setsToWin}
            onScore={onScore}
          />
        ))}
      </div>

      {knockoutMatches.length > 0 && (
        <div className="gs-knockout-section">
          <div className="gs-knockout-header">
            <h3 className="gs-section-title">Knockout Phase</h3>
            {knockoutMatches.every(m => !m.participant1Id && !m.participant2Id) && (
              <span className="gs-knockout-badge">
                Winners advance automatically after group stage completes
              </span>
            )}
          </div>
          <BracketView draw={knockoutMatches} participants={participants} />
        </div>
      )}
    </div>
  );
}
