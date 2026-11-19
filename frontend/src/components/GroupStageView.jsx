import React, { useState } from "react";
import ScoreModal from "./ScoreModal";
import { formatScore } from "../scoreRules";
import BracketView from "./BracketView";

// ── Standings ─────────────────────────────────────────────────────────────────
// The table comes from the API (GET .../events/:eid/standings, F-08: wins, then
// head-to-head / mini-league, then % sets, then % games), which is also what
// decides the champion. This local version only fills in until it arrives.
function localStandings(members, matches) {
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
  return Object.values(stats)
    .sort((a, b) => b.w - a.w || (b.gw - b.gl) - (a.gw - a.gl))
    .map(s => ({ participantId: s.pid, played: s.w + s.l, wins: s.w, losses: s.l, setsWon: 0, setsLost: 0, gamesWon: s.gw, gamesLost: s.gl, tied: false }));
}

// ── Single group block ────────────────────────────────────────────────────────
function GroupPool({ group, matches, pMap, advancePerGroup, isOrganiser, onScore, serverRows, roundRobin }) {
  const [activeModal, setActiveModal] = useState(null);

  const members    = (group.participantIds ?? []).map(id => pMap[id]).filter(Boolean);
  const standings  = serverRows ?? localStandings(members, matches);
  const advancing  = roundRobin ? 0 : advancePerGroup;
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
              <th title="Played">P</th>
              <th title="Won–lost">W–L</th>
              <th>Sets</th>
              <th>Games</th>
              <th>Pos</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => (
              <tr key={s.participantId} className={i < advancing ? "gs-row-advance" : ""}>
                <td className="gs-std-name">
                  {i < advancing && <span className="gs-advance-dot" title="Advances to knockout" />}
                  {label(pMap[s.participantId])}
                </td>
                <td className="gs-std-stat">{s.played}</td>
                <td className="gs-std-stat">{s.wins}–{s.losses}</td>
                <td className="gs-std-stat">{s.setsWon}–{s.setsLost}</td>
                <td className="gs-std-stat">{s.gamesWon}–{s.gamesLost}</td>
                <td className="gs-std-pos">{i + 1}{s.tied && <span className="gs-tied" title="Level on every tiebreak: the organiser decides">=</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="gs-legend">
        Order: wins, then head-to-head (a mini-league for three or more level), then % sets, then % games.
        A walkover counts as a win to love. <span className="gs-tied">=</span> level on everything: the organiser decides.
      </p>

      {/* ── Round by round (F-08) ── */}
      {roundRobin && (
        <div className="gs-rounds">
          {[...new Set(matches.map(m => m.round))].sort((a, b) => a - b).map(r => (
            <div key={r} className="gs-round">
              <div className="gs-scheduled-title">Round {r}</div>
              {matches.filter(m => m.round === r).map(m => {
                const done = m.status === "COMPLETED" || m.status === "WALKOVER";
                const canScore = isOrganiser && !done;
                return (
                  <div key={m.id} className={`gs-sched-row${canScore ? " gs-sched-clickable" : ""}`}
                    onClick={canScore ? () => setActiveModal(m) : undefined}>
                    <span className={`gs-sched-player${done && m.winnerId === m.participant1Id ? " gs-winner" : ""}`}>{label(pMap[m.participant1Id])}</span>
                    <span className="gs-sched-vs">{done ? formatScore(m.sets ?? [], m.outcome ?? "COMPLETED") : "vs"}</span>
                    <span className={`gs-sched-player${done && m.winnerId === m.participant2Id ? " gs-winner" : ""}`}>{label(pMap[m.participant2Id])}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Scheduled matches ── */}
      {!roundRobin && scheduled.length > 0 && (
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
export default function GroupStageView({ tournament, draw, participants, isOrganiser, onScore, standings = [], roundRobin = false, renderKnockout }) {
  const pMap          = Object.fromEntries(participants.map(p => [p.id, p]));
  const groups        = (tournament.groups ?? []).slice().sort((a, b) => a.position - b.position);
  const advancePerGroup = tournament.advancePerGroup ?? 2;

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
            onScore={onScore}
            serverRows={standings.find(s => s.groupId === group.id)?.rows}
            roundRobin={roundRobin}
          />
        ))}
      </div>

      {!roundRobin && knockoutMatches.length > 0 && (
        <div className="gs-knockout-section">
          <div className="gs-knockout-header">
            <h3 className="gs-section-title">Knockout Phase</h3>
          </div>
          {/* Where each group stands (F-09): its qualifiers fill the slots when it finishes. */}
          <ul className="gs-group-status">
            {groups.map(group => {
              const ms = groupMatches.filter(m => m.groupId === group.id);
              const played = ms.filter(m => m.status === "COMPLETED" || m.status === "WALKOVER").length;
              const letter = (group.name ?? "").replace("Group ", "");
              const rows = standings.find(s => s.groupId === group.id)?.rows ?? [];
              const name = pid => { const p = pMap[pid]; return p?.seed ? `Seed ${p.seed}` : pid ? pid.slice(0, 6) + "…" : "?"; };
              return (
                <li key={group.id}>
                  {played === ms.length && ms.length > 0
                    ? <><strong>{group.name} complete</strong>: {rows.slice(0, advancePerGroup).map((r, i) => `${letter}${i + 1}: ${name(r.participantId)}`).join(", ")}</>
                    : <>{group.name}: {played} of {ms.length} matches played</>}
                </li>
              );
            })}
          </ul>
          {renderKnockout ? renderKnockout(knockoutMatches) : <BracketView draw={knockoutMatches} participants={participants} />}
        </div>
      )}
    </div>
  );
}
