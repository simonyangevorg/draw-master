import React from "react";

// ── Layout constants ─────────────────────────────────────────────────────────
const CARD_W  = 218;   // match card width
const CARD_H  = 76;    // match card height (two player rows)
const COL_GAP = 52;    // horizontal space between rounds (connector lives here)
const ROW_GAP = 12;    // gap between cards in the first round

// ── Bracket math ─────────────────────────────────────────────────────────────
// In round r (0-indexed), match at index i has its top edge at:
//   firstTop(r) + i * spacing(r)
// where:
//   spacing(r)  = 2^r * (CARD_H + ROW_GAP)
//   firstTop(r) = (2^r - 1) * (CARD_H + ROW_GAP) / 2
function matchTop(roundIdx, matchIdx) {
  const unit    = CARD_H + ROW_GAP;
  const first   = ((Math.pow(2, roundIdx) - 1) * unit) / 2;
  const spacing = Math.pow(2, roundIdx) * unit;
  return first + matchIdx * spacing;
}

function matchCenter(roundIdx, matchIdx) {
  return matchTop(roundIdx, matchIdx) + CARD_H / 2;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SeedBadge({ seed }) {
  if (!seed) return <span className="bk-seed bk-seed-empty" />;
  return <span className="bk-seed">{seed}</span>;
}

function ScoreCell({ sets, playerKey }) {
  if (!sets?.length) return null;
  return (
    <span className="bk-score">
      {sets.map((s, i) => (
        <span key={i} className="bk-set">{s[playerKey]}</span>
      ))}
    </span>
  );
}

function PlayerRow({ participantId, participant, isWinner, sets, playerKey, isBye, slotLabel }) {
  const seed  = participant?.seed;
  const label = isBye
    ? "BYE"
    : slotLabel
    ? slotLabel
    : !participantId
    ? "TBD"
    : `Player ${participantId.slice(0, 6)}`;

  return (
    <div className={`bk-player-row${isWinner ? " bk-winner" : ""}${isBye ? " bk-bye-row" : ""}`}>
      <SeedBadge seed={seed} />
      <span className="bk-player-name">{label}</span>
      <ScoreCell sets={sets} playerKey={playerKey} />
    </div>
  );
}

function MatchCard({ match, pMap, style }) {
  const p1 = pMap[match.participant1Id];
  const p2 = pMap[match.participant2Id];
  const isBye = match.status === "BYE";
  const isDone = match.status === "COMPLETED" || match.status === "WALKOVER";

  return (
    <div
      className={`bk-card${isBye ? " bk-card-bye" : ""}${isDone ? " bk-card-done" : ""}`}
      style={style}
    >
      <PlayerRow
        participantId={match.participant1Id}
        participant={p1}
        isWinner={isDone && match.winnerId === match.participant1Id}
        sets={match.sets}
        playerKey="p1"
        isBye={false}
        slotLabel={!match.participant1Id ? match.slot1 : null}
      />
      <div className="bk-divider" />
      <PlayerRow
        participantId={match.participant2Id}
        participant={p2}
        isWinner={isDone && match.winnerId === match.participant2Id}
        sets={match.sets}
        playerKey="p2"
        isBye={isBye}
        slotLabel={!match.participant2Id ? match.slot2 : null}
      />
    </div>
  );
}

// ── SVG connectors ────────────────────────────────────────────────────────────
function Connectors({ draw, rounds }) {
  const lines = [];
  const STROKE = "#d1d5db";

  rounds.slice(0, -1).forEach((round, ri) => {
    const matches = draw
      .filter(m => m.round === round)
      .sort((a, b) => a.position - b.position);

    // Each adjacent pair (0,1), (2,3), … feeds one next-round match
    for (let mi = 0; mi < matches.length; mi += 2) {
      const x1   = ri * (CARD_W + COL_GAP) + CARD_W;          // right edge of current col
      const x2   = (ri + 1) * (CARD_W + COL_GAP);             // left edge of next col
      const xMid = (x1 + x2) / 2;

      const topY  = matchCenter(ri, mi);
      const botY  = matchCenter(ri, mi + 1);
      const nextY = matchCenter(ri + 1, mi / 2);

      lines.push(
        <g key={`conn-${round}-${mi}`} stroke={STROKE} strokeWidth="1.5" fill="none">
          <line x1={x1}   y1={topY}  x2={xMid} y2={topY}  />
          <line x1={x1}   y1={botY}  x2={xMid} y2={botY}  />
          <line x1={xMid} y1={topY}  x2={xMid} y2={botY}  />
          <line x1={xMid} y1={nextY} x2={x2}   y2={nextY} />
        </g>
      );
    }
  });

  return <>{lines}</>;
}

// ── Round name helpers ─────────────────────────────────────────────────────────
function getRoundName(roundIdx, totalRounds) {
  const fromEnd = totalRounds - 1 - roundIdx;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semi-Finals";
  if (fromEnd === 2) return "Quarter-Finals";
  return `Round of ${Math.pow(2, fromEnd + 1)}`;
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function BracketView({ draw, participants }) {
  const pMap = Object.fromEntries((participants ?? []).map(p => [p.id, p]));

  const rounds = [...new Set(draw.map(m => m.round))].sort((a, b) => a - b);
  if (!rounds.length) return null;

  const r1Count    = draw.filter(m => m.round === rounds[0]).length;
  const totalH     = r1Count * (CARD_H + ROW_GAP) - ROW_GAP;
  const totalW     = rounds.length * CARD_W + (rounds.length - 1) * COL_GAP;
  const labelH     = 28;

  return (
    <div className="bk-scroll">
      {/* Round labels row */}
      <div className="bk-labels" style={{ width: totalW }}>
        {rounds.map((_, ri) => (
          <div
            key={ri}
            className="bk-label"
            style={{ width: CARD_W, left: ri * (CARD_W + COL_GAP) }}
          >
            {getRoundName(ri, rounds.length)}
          </div>
        ))}
      </div>

      {/* Bracket canvas */}
      <div className="bk-canvas" style={{ width: totalW, height: totalH }}>
        {/* SVG connector lines */}
        <svg
          className="bk-svg"
          width={totalW}
          height={totalH}
          xmlns="http://www.w3.org/2000/svg"
        >
          <Connectors draw={draw} rounds={rounds} />
        </svg>

        {/* Match cards */}
        {rounds.map((round, ri) => {
          const matches = draw
            .filter(m => m.round === round)
            .sort((a, b) => a.position - b.position);
          return matches.map((match, mi) => (
            <MatchCard
              key={match.id}
              match={match}
              pMap={pMap}
              style={{
                position: "absolute",
                top:  matchTop(ri, mi),
                left: ri * (CARD_W + COL_GAP),
                width: CARD_W,
                height: CARD_H,
              }}
            />
          ));
        })}
      </div>
    </div>
  );
}
