import React, { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, apiPatch } from "../api";
import BracketView from "../components/BracketView";
import GroupStageView from "../components/GroupStageView";

const STATUS_BADGE = {
  DRAFT:       { label: "Draft",       color: "#6b7280" },
  OPEN:        { label: "Open",        color: "#2d7a4f" },
  IN_PROGRESS: { label: "In Progress", color: "#d97706" },
  COMPLETED:   { label: "Completed",   color: "#1d4ed8" },
  CANCELLED:   { label: "Cancelled",   color: "#dc2626" },
};

const SURFACE_LABEL = {
  CLAY:"Clay", HARD_OUTDOOR:"Hard (Outdoor)", HARD_INDOOR:"Hard (Indoor)",
  GRASS:"Grass", CARPET:"Carpet", ACRYLIC:"Acrylic",
  ARTIFICIAL_CLAY:"Artificial Clay", ARTIFICIAL_GRASS:"Artificial Grass",
};

export default function TournamentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tournament, setTournament]   = useState(null);
  const [draw, setDraw]               = useState([]);
  const [activeTab, setActiveTab]     = useState("overview");
  const [loading, setLoading]         = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg]                 = useState({ text: "", error: false });

  const isOrganiser = tournament?.organiserId === user?.id;

  useEffect(() => { loadTournament(); }, [id]);

  async function loadTournament() {
    setLoading(true);
    try {
      const [tRes, dRes] = await Promise.all([
        apiGet(`/api/tournaments/${id}`),
        apiGet(`/api/tournaments/${id}/draw`),
      ]);
      const t = await tRes.json();
      const d = await dRes.json();
      setTournament(t);
      setDraw(Array.isArray(d) ? d : []);
    } catch { setTournament(null); }
    finally  { setLoading(false); }
  }

  function flash(text, error = false) { setMsg({ text, error }); }

  async function openRegistration() {
    setActionLoading(true);
    await apiPost(`/api/tournaments/${id}/open`);
    await loadTournament();
    flash("Tournament is now open for registration.");
    setActionLoading(false);
  }

  async function generateDraw() {
    setActionLoading(true);
    setMsg({ text: "" });
    const res = await apiPost(`/api/tournaments/${id}/draw`);
    if (res.ok) { await loadTournament(); flash("Draw generated successfully!"); }
    else { const e = await res.json().catch(() => ({})); flash(e.message || "Could not generate draw", true); }
    setActionLoading(false);
  }

  async function enroll() {
    setActionLoading(true);
    const res = await apiPost(`/api/tournaments/${id}/participants`, { playerId: user.id });
    if (res.ok) { await loadTournament(); flash("Application submitted successfully!"); }
    else { const e = await res.json().catch(() => ({})); flash(e.message || "Failed to apply", true); }
    setActionLoading(false);
  }

  async function withdrawParticipant(pid) {
    if (!confirm("Withdraw this participant?")) return;
    const res = await apiPatch(`/api/tournaments/${id}/participants/${pid}/withdraw`);
    if (res.ok) { await loadTournament(); flash("Participant withdrawn."); }
    else { const e = await res.json().catch(() => ({})); flash(e.message || "Failed to withdraw", true); }
  }

  async function approveParticipant(pid) {
    const res = await apiPatch(`/api/tournaments/${id}/participants/${pid}/approve`);
    if (res.ok) { await loadTournament(); flash("Participant approved."); }
    else { const e = await res.json().catch(() => ({})); flash(e.message || "Failed to approve", true); }
  }

  async function rejectParticipant(pid) {
    const res = await apiPatch(`/api/tournaments/${id}/participants/${pid}/reject`);
    if (res.ok) { await loadTournament(); flash("Participant rejected."); }
    else { const e = await res.json().catch(() => ({})); flash(e.message || "Failed to reject", true); }
  }

  async function swapInDraw(pid1, pid2) {
    const res = await apiPost(`/api/tournaments/${id}/draw/swap`, { participantId1: pid1, participantId2: pid2 });
    if (res.ok) { const d = await res.json(); setDraw(Array.isArray(d) ? d : []); }
    else { const e = await res.json().catch(() => ({})); flash(e.message || "Swap failed", true); }
  }

  async function scoreMatch(matchId, sets, winnerId) {
    const res = await apiPatch(`/api/tournaments/${id}/matches/${matchId}`, { sets, winnerId });
    if (res.ok) { await loadTournament(); flash("Score saved — winner advanced."); }
    else { const e = await res.json().catch(() => ({})); flash(e.message || "Failed to save score", true); }
  }

  if (loading) return <div className="page-loading">Loading tournament…</div>;
  if (!tournament?.id) return <div className="page-loading">Tournament not found.</div>;

  const badge = STATUS_BADGE[tournament.status] ?? STATUS_BADGE.DRAFT;
  const participants = tournament.participants ?? [];

  // Current user's participation record (if any)
  const myParticipant = participants.find(p => p.playerId === user?.id);
  const canApply = !isOrganiser && tournament.status === "OPEN" && !myParticipant;

  // Players not yet in the draw (APPROVED but no slot in any match)
  const inDrawIds = new Set(draw.flatMap(m => [m.participant1Id, m.participant2Id]).filter(Boolean));
  const drawPool  = participants.filter(p => p.status === "APPROVED" && !inDrawIds.has(p.id));

  return (
    <div className="dash-layout">
      <aside className="sidebar">
        <Link to="/" className="sidebar-logo">
          <img src="/logo.png" alt="FPTC" className="sidebar-logo-img" />
        </Link>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className="sidebar-link"><span>🏠</span> Dashboard</Link>
          {user?.role === "ORGANISER" && (
            <Link to="/tournaments/new" className="sidebar-link"><span>➕</span> New Tournament</Link>
          )}
          <Link to="/tournaments" className="sidebar-link"><span>🏆</span> Tournaments</Link>
        </nav>
      </aside>

      <main className="dash-main">
        {/* Header */}
        <div className="dash-header">
          <div>
            <Link to="/dashboard" className="back-btn">← Dashboard</Link>
            <div className="t-detail-title-row">
              <h1 className="dash-title">{tournament.name}</h1>
              <span className="t-badge t-badge-lg" style={{ background: badge.color }}>{badge.label}</span>
            </div>
            <div className="t-detail-meta">
              {tournament.city && <span>📍 {tournament.city}</span>}
              <span>🎾 {SURFACE_LABEL[tournament.surface] ?? tournament.surface}</span>
              <span>📅 {tournament.startDate} → {tournament.endDate}</span>
              <span>👥 {participants.length}/{tournament.maxParticipants}</span>
            </div>
          </div>

          {isOrganiser && (
            <div className="t-actions">
              {tournament.status === "DRAFT" && (
                <button className="btn btn-primary" onClick={openRegistration} disabled={actionLoading}>Open Registration</button>
              )}
              {tournament.status === "OPEN" && (
                <button className="btn btn-primary" onClick={generateDraw} disabled={actionLoading}>Generate Draw</button>
              )}
            </div>
          )}

        </div>

        {msg.text && (
          <div className={`alert ${msg.error ? "alert-error" : "alert-success"}`}>{msg.text}</div>
        )}

        {/* ── Player enrolment action bar ── */}
        {!isOrganiser && (
          <div className="enrol-bar">
            {canApply && (
              <>
                <span className="enrol-bar-text">Registration is open — secure your spot now.</span>
                <button className="btn btn-primary" onClick={enroll} disabled={actionLoading}>Apply to Tournament</button>
              </>
            )}
            {myParticipant?.status === "PENDING" && (
              <>
                <span className="enrol-bar-text">Your application is <strong>pending approval</strong> from the organiser.</span>
                <button className="btn btn-ghost btn-sm" onClick={() => withdrawParticipant(myParticipant.id)} disabled={actionLoading}>Cancel application</button>
              </>
            )}
            {myParticipant?.status === "APPROVED" && (
              <>
                <span className="enrol-bar-text">You are <strong>registered</strong> for this tournament.</span>
                {tournament.status === "OPEN" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => withdrawParticipant(myParticipant.id)} disabled={actionLoading}>Withdraw</button>
                )}
              </>
            )}
            {myParticipant?.status === "REJECTED" && (
              <span className="enrol-bar-text" style={{ color: "#991b1b" }}>Your application was rejected by the organiser.</span>
            )}
            {myParticipant?.status === "WITHDRAWN" && tournament.status === "OPEN" && (
              <>
                <span className="enrol-bar-text">You previously withdrew from this tournament.</span>
                <button className="btn btn-primary" onClick={enroll} disabled={actionLoading}>Apply again</button>
              </>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          {["overview", "participants", "draw"].map(tab => (
            <button key={tab} className={`tab ${activeTab === tab ? "tab-active" : ""}`} onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="detail-grid">
            <div className="detail-card">
              <h3>Tournament Details</h3>
              <dl className="detail-list">
                <dt>Type</dt><dd>{tournament.tournamentType?.replace(/_/g, " ")}</dd>
                <dt>Format</dt><dd>{tournament.drawFormat?.replace(/_/g, " ")}</dd>
                <dt>Surface</dt><dd>{tournament.surface}</dd>
                <dt>Age Group</dt><dd>{tournament.ageGroup}</dd>
                <dt>Participants</dt><dd>{participants.length} / {tournament.maxParticipants}</dd>
                {tournament.venue && <><dt>Venue</dt><dd>{tournament.venue}</dd></>}
                {tournament.description && <><dt>Description</dt><dd>{tournament.description}</dd></>}
              </dl>
            </div>
            <div className="detail-card">
              <h3>Match Format</h3>
              <dl className="detail-list">
                <dt>Sets to Win</dt><dd>{tournament.setsToWin === 1 ? "Best of 1" : tournament.setsToWin === 2 ? "Best of 3" : "Best of 5"}</dd>
                <dt>Games per Set</dt><dd>{tournament.gamesPerSet}</dd>
                <dt>Tiebreak at</dt><dd>{tournament.tiebreakAt}-{tournament.tiebreakAt}</dd>
                <dt>Final Set</dt><dd>{tournament.finalSetTiebreak ? "Champion Tiebreak" : "Full Set"}</dd>
                <dt>No-Ad Scoring</dt><dd>{tournament.noAd ? "Yes" : "No"}</dd>
                <dt>Seeded</dt><dd>{tournament.seeded ? "Yes" : "No"}</dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Prizes & Access</h3>
              <dl className="detail-list">
                <dt>Entry Fee</dt><dd>{tournament.entryFee ? `$${tournament.entryFee}` : "Free"}</dd>
                <dt>Prize Pool</dt><dd>{tournament.prizePool ? `$${tournament.prizePool}` : "—"}</dd>
                <dt>Ranking Points</dt><dd>{tournament.rankingPoints ?? "—"}</dd>
                <dt>Public</dt><dd>{tournament.isPublic ? "Yes" : "No"}</dd>
                <dt>Requires Approval</dt><dd>{tournament.requiresApproval ? "Yes" : "No"}</dd>
              </dl>
            </div>
          </div>
        )}

        {/* ── Participants ── */}
        {activeTab === "participants" && (
          <ParticipantsPanel
            participants={participants}
            isOrganiser={isOrganiser}
            currentUserId={user?.id}
            tournamentStatus={tournament.status}
            onWithdraw={withdrawParticipant}
            onApprove={approveParticipant}
            onReject={rejectParticipant}
          />
        )}

        {/* ── Draw ── */}
        {activeTab === "draw" && (
          <div className="draw-panel">
            {draw.length === 0 ? (
              <div className="dash-empty">
                <div className="dash-empty-icon">🎾</div>
                <p>{tournament.status === "OPEN" && isOrganiser ? "Draw not generated yet." : "Draw not available yet."}</p>
                {tournament.status === "OPEN" && isOrganiser && (
                  <button className="btn btn-primary" onClick={generateDraw} disabled={actionLoading}>Generate Draw</button>
                )}
              </div>
            ) : tournament.drawFormat === "GROUP_STAGE_KNOCKOUT" ? (
              <GroupStageView
                tournament={tournament}
                draw={draw}
                participants={participants}
                isOrganiser={isOrganiser}
                onScore={scoreMatch}
              />
            ) : (
              <DrawManager
                draw={draw}
                participants={participants}
                pool={drawPool}
                isOrganiser={isOrganiser}
                tournamentId={id}
                setsToWin={tournament.setsToWin ?? 2}
                onSwap={swapInDraw}
                onScore={scoreMatch}
                onReload={loadTournament}
                flash={flash}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ── Participants panel ────────────────────────────────────────────────────────
function ParticipantsPanel({ participants, isOrganiser, currentUserId, tournamentStatus, onWithdraw, onApprove, onReject }) {
  const STATUS_COLOR = { APPROVED: "#2d7a4f", PENDING: "#d97706", REJECTED: "#dc2626", WITHDRAWN: "#6b7280" };

  const pending  = participants.filter(p => p.status === "PENDING");
  const approved = participants.filter(p => p.status === "APPROVED");
  const others   = participants.filter(p => p.status !== "PENDING" && p.status !== "APPROVED");

  const ordered = [...pending, ...approved, ...others];

  if (ordered.length === 0)
    return <div className="dash-empty">No participants yet.</div>;

  return (
    <div className="participants-panel">
      {isOrganiser && pending.length > 0 && (
        <div className="alert alert-info" style={{ marginBottom: "1rem" }}>
          {pending.length} pending application{pending.length > 1 ? "s" : ""} awaiting approval
        </div>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Player ID</th>
            <th>Partner</th>
            <th>Seed</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((p, i) => {
            const isMe = p.playerId === currentUserId;
            const canWithdrawSelf = isMe && (p.status === "APPROVED" || p.status === "PENDING") && tournamentStatus === "OPEN";
            const canOrgWithdraw  = isOrganiser && p.status === "APPROVED";
            const canApprove      = isOrganiser && p.status === "PENDING";
            const canReject       = isOrganiser && p.status === "PENDING";

            return (
              <tr key={p.id}>
                <td>{i + 1}</td>
                <td className="mono">
                  {p.playerId.slice(0, 8)}…
                  {isMe && <span style={{ marginLeft: ".4rem", fontSize: ".7rem", color: "var(--green)", fontWeight: 700 }}>you</span>}
                </td>
                <td className="mono">{p.partnerId ? p.partnerId.slice(0, 8) + "…" : "—"}</td>
                <td>{p.seed ?? "—"}</td>
                <td>
                  <span className="t-badge" style={{ background: STATUS_COLOR[p.status] ?? "#6b7280" }}>
                    {p.status}
                  </span>
                </td>
                <td>
                  <div className="participant-actions">
                    {canApprove && (
                      <button className="btn-approve" onClick={() => onApprove(p.id)}>Approve</button>
                    )}
                    {canReject && (
                      <button className="btn-reject" onClick={() => onReject(p.id)}>Reject</button>
                    )}
                    {(canWithdrawSelf || canOrgWithdraw) && (
                      <button className="btn-withdraw" onClick={() => onWithdraw(p.id)}>
                        {isMe && p.status === "PENDING" ? "Cancel" : "Withdraw"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Draw manager (bracket + drag/drop + pool) ─────────────────────────────────
function DrawManager({ draw, participants, pool, isOrganiser, tournamentId, setsToWin, onSwap, onScore, onReload, flash }) {
  const pMap = Object.fromEntries(participants.map(p => [p.id, p]));
  const dragSource = useRef(null);
  const [poolOver, setPoolOver]     = useState(false);
  const [scoreMatch, setScoreMatch] = useState(null); // match object being scored

  function playerLabel(pid) {
    const p = pMap[pid];
    return p?.seed ? `Seed ${p.seed}` : pid ? pid.slice(0, 6) + "…" : "TBD";
  }

  async function patchSlot(matchId, slot, participantId) {
    const res = await apiPatch(`/api/tournaments/${tournamentId}/draw/${matchId}/slot`, { slot, participantId: participantId ?? null });
    if (res.ok) onReload();
    else { const e = await res.json().catch(() => ({})); flash(e.message || "Failed", true); }
  }

  async function setBye(matchId, slot) {
    // Clears the slot — if called on a filled slot it removes the player (→ pool)
    // If called on an empty slot of a match that has one player, marks it BYE
    // Backend handles status=BYE automatically when p1 filled + p2 null
    await patchSlot(matchId, slot, null);
  }

  // Drop onto a bracket slot
  async function handleDropOnSlot(targetMatchId, targetSlot, currentPid) {
    const src = dragSource.current;
    dragSource.current = null;
    if (!src) return;

    if (src.pid === currentPid) return; // dropped on itself

    if (src.fromMatchId) {
      // Bracket → bracket: swap the two participants
      if (currentPid) {
        await onSwap(src.pid, currentPid);
      } else {
        // Bracket → empty slot: move player into empty slot, clear source slot
        await patchSlot(targetMatchId, targetSlot, src.pid);
        await patchSlot(src.fromMatchId, src.fromSlot, null);
      }
    } else {
      // Pool → bracket slot
      if (currentPid) {
        // Drop on occupied slot — swap: put pool player in, send bracket player back to pool
        await patchSlot(targetMatchId, targetSlot, src.pid);
        // The displaced player is now in the pool automatically (no match slot)
      } else {
        // Drop on empty slot — add player
        await patchSlot(targetMatchId, targetSlot, src.pid);
      }
    }
  }

  // Drop onto the pool sidebar → remove from bracket
  async function handleDropOnPool() {
    setPoolOver(false);
    const src = dragSource.current;
    dragSource.current = null;
    if (!src?.fromMatchId) return; // was already in pool
    await patchSlot(src.fromMatchId, src.fromSlot, null);
  }

  return (
    <div className="draw-manager">
      {/* Pool sidebar — always shown to organiser */}
      {isOrganiser && (
        <div
          className={`draw-pool${poolOver ? " draw-pool-over" : ""}`}
          onDragOver={e => { e.preventDefault(); setPoolOver(true); }}
          onDragLeave={() => setPoolOver(false)}
          onDrop={handleDropOnPool}
        >
          <div className="draw-pool-title">Available Players</div>
          <div className="draw-pool-hint">
            {pool.length === 0 ? "All players are in the draw" : "Drag onto a slot · drop here to remove"}
          </div>
          {pool.map(p => (
            <div
              key={p.id}
              className="draw-pool-player"
              draggable
              onDragStart={() => { dragSource.current = { pid: p.id, fromMatchId: null, fromSlot: null }; }}
            >
              {p.seed && <span className="bk-seed">{p.seed}</span>}
              {playerLabel(p.id)}
            </div>
          ))}
          {pool.length === 0 && <div className="draw-pool-empty-drop">Drop player here</div>}
        </div>
      )}

      {/* Bracket */}
      <div className="draw-bracket-wrap">
        <DraggableBracket
          draw={draw}
          pMap={pMap}
          isOrganiser={isOrganiser}
          dragSource={dragSource}
          onDropOnSlot={handleDropOnSlot}
          onSetBye={setBye}
          onCardClick={match => {
            // Only open score modal for playable matches (both players set, not done)
            const canScore = match.participant1Id && match.participant2Id
              && match.status !== "BYE" && match.status !== "COMPLETED" && match.status !== "WALKOVER";
            if (canScore) setScoreMatch(match);
          }}
          playerLabel={playerLabel}
        />
      </div>

      {/* Score modal */}
      {scoreMatch && (
        <ScoreModal
          match={scoreMatch}
          pMap={pMap}
          setsToWin={setsToWin}
          playerLabel={playerLabel}
          onSave={async (sets, winnerId) => {
            setScoreMatch(null);
            await onScore(scoreMatch.id, sets, winnerId);
          }}
          onClose={() => setScoreMatch(null)}
        />
      )}
    </div>
  );
}

// ── Draggable bracket (wraps BracketView logic with DnD) ─────────────────────
// Rather than duplicating BracketView layout, we render a DnD-enabled version
// using the same positioning math as BracketView.

const CARD_W  = 218;
const CARD_H  = 98;  // 37 + 1 + 37 + 1 + 22 (score row)
const COL_GAP = 52;
const ROW_GAP = 12;

function matchTop(ri, mi) {
  const unit  = CARD_H + ROW_GAP;
  const first = ((Math.pow(2, ri) - 1) * unit) / 2;
  return first + mi * Math.pow(2, ri) * unit;
}
function matchCenter(ri, mi) { return matchTop(ri, mi) + CARD_H / 2; }

function DraggableBracket({ draw, pMap, isOrganiser, dragSource, onDropOnSlot, onSetBye, onCardClick, playerLabel }) {
  const rounds = [...new Set(draw.map(m => m.round))].sort((a, b) => a - b);
  if (!rounds.length) return null;

  const r1Count = draw.filter(m => m.round === rounds[0]).length;
  const totalH  = r1Count * (CARD_H + ROW_GAP) - ROW_GAP;
  const totalW  = rounds.length * CARD_W + (rounds.length - 1) * COL_GAP;

  const [dragOver, setDragOver] = useState(null);

  function roundLabel(ri) {
    const fromEnd = rounds.length - 1 - ri;
    if (fromEnd === 0) return "Final";
    if (fromEnd === 1) return "Semi-Finals";
    if (fromEnd === 2) return "Quarter-Finals";
    return `Round of ${Math.pow(2, fromEnd + 1)}`;
  }

  // A slot is editable only when its feeder match in the previous round is
  // resolved — meaning it is a BYE (auto-advance) or COMPLETED/WALKOVER.
  // Round 1 is always editable.
  function feederResolved(match, slot, ri) {
    if (ri === 0) return true;
    const prevRound  = rounds[ri - 1];
    // participant1Id is fed by feeder position match.position*2
    // participant2Id is fed by feeder position match.position*2 + 1
    const feederPos  = slot === "participant1Id" ? match.position * 2 : match.position * 2 + 1;
    const feeder     = draw.find(m => m.round === prevRound && m.position === feederPos);
    if (!feeder) return false;
    return feeder.status === "BYE" || feeder.status === "COMPLETED" || feeder.status === "WALKOVER";
  }

  return (
    <div className="bk-scroll">
      <div className="bk-labels" style={{ width: totalW }}>
        {rounds.map((_, ri) => (
          <div key={ri} className="bk-label" style={{ width: CARD_W, left: ri * (CARD_W + COL_GAP) }}>{roundLabel(ri)}</div>
        ))}
      </div>

      <div className="bk-canvas" style={{ width: totalW, height: totalH }}>
        {/* SVG connectors */}
        <svg className="bk-svg" width={totalW} height={totalH} xmlns="http://www.w3.org/2000/svg">
          {rounds.slice(0, -1).map((round, ri) => {
            const matches = draw.filter(m => m.round === round).sort((a, b) => a.position - b.position);
            return matches.map((_, mi) => {
              if (mi % 2 !== 0) return null;
              const x1 = ri * (CARD_W + COL_GAP) + CARD_W;
              const x2 = (ri + 1) * (CARD_W + COL_GAP);
              const xm = (x1 + x2) / 2;
              const topY = matchCenter(ri, mi);
              const botY = matchCenter(ri, mi + 1);
              const nxtY = matchCenter(ri + 1, mi / 2);
              return (
                <g key={`${round}-${mi}`} stroke="#d1d5db" strokeWidth="1.5" fill="none">
                  <line x1={x1} y1={topY} x2={xm} y2={topY} />
                  <line x1={x1} y1={botY} x2={xm} y2={botY} />
                  <line x1={xm} y1={topY} x2={xm} y2={botY} />
                  <line x1={xm} y1={nxtY} x2={x2} y2={nxtY} />
                </g>
              );
            });
          })}
        </svg>

        {/* Match cards */}
        {rounds.map((round, ri) => {
          const matches = draw.filter(m => m.round === round).sort((a, b) => a.position - b.position);
          return matches.map((match, mi) => {
            const isDone = match.status === "COMPLETED" || match.status === "WALKOVER";
            const isBye  = match.status === "BYE";

            const renderSlot = (pid, slot, fallbackLabel) => {
              const isWinner   = isDone && match.winnerId === pid;
              const isEmpty    = !pid;
              const key        = `${match.id}-${slot}`;
              const isOver     = dragOver === key;
              const isByeSlot  = isBye && slot === "participant2Id";
              const canEdit    = isOrganiser && !isDone && feederResolved(match, slot, ri);
              // Only lock EMPTY slots — if a player is already placed, slot is not locked
              const isLocked   = isOrganiser && !isDone && !pid && !feederResolved(match, slot, ri);
              const label      = pid
                ? playerLabel(pid)
                : isByeSlot ? "BYE"
                : fallbackLabel || "TBD";

              return (
                <div
                  className={[
                    "bk-player-row",
                    isWinner  ? "bk-winner"   : "",
                    isEmpty && !isByeSlot ? "bk-tbd" : "",
                    isByeSlot ? "bk-bye-row"  : "",
                    isOver    ? "bk-drop-over": "",
                    isLocked  ? "bk-locked"   : "",
                  ].filter(Boolean).join(" ")}
                  draggable={canEdit && !!pid}
                  onDragStart={canEdit && pid ? () => {
                    dragSource.current = { pid, fromMatchId: match.id, fromSlot: slot };
                  } : undefined}
                  onDragOver={canEdit ? e => { e.preventDefault(); setDragOver(key); } : undefined}
                  onDragLeave={canEdit ? () => setDragOver(null) : undefined}
                  onDrop={canEdit ? () => { setDragOver(null); onDropOnSlot(match.id, slot, pid); } : undefined}
                  onClick={canScore ? e => { if (e.target.tagName !== "BUTTON") onCardClick(match); } : undefined}
                  title={isLocked ? "Previous round must be a BYE or completed first" : undefined}
                >
                  {pMap[pid]?.seed && <span className="bk-seed">{pMap[pid].seed}</span>}
                  <span className="bk-player-name">{label}</span>

                  {canEdit && (
                    <>
                      {pid && (
                        <button
                          className="bk-remove-btn"
                          title="Remove from draw"
                          onClick={e => { e.stopPropagation(); onSetBye(match.id, slot); }}
                        >×</button>
                      )}
                      {isEmpty && !isByeSlot && ri === 0 && (
                        <button
                          className="bk-bye-btn"
                          title="Assign BYE"
                          onClick={e => { e.stopPropagation(); onSetBye(match.id, slot); }}
                        >BYE</button>
                      )}
                    </>
                  )}
                </div>
              );
            };

            const bothSet  = match.participant1Id && match.participant2Id;
            const canScore = isOrganiser && bothSet && !isDone && !isBye;

            return (
              <div
                key={match.id}
                className={`bk-card${isBye ? " bk-card-bye" : ""}${isDone ? " bk-card-done" : ""}${canScore ? " bk-card-scorable" : ""}`}
                style={{ position: "absolute", top: matchTop(ri, mi), left: ri * (CARD_W + COL_GAP), width: CARD_W, height: CARD_H }}
                onClick={canScore ? () => onCardClick(match) : undefined}
                title={canScore ? "Click to enter score" : undefined}
              >
                {renderSlot(match.participant1Id, "participant1Id", match.slot1)}
                <div className="bk-divider" />
                {renderSlot(match.participant2Id, "participant2Id", match.slot2)}
                <div
                  className="bk-score-summary"
                  onClick={canScore ? () => onCardClick(match) : undefined}
                >
                  {isDone && match.sets?.length > 0
                    ? match.sets.map((s, i) => (
                        <span key={i} className="bk-score-set">{s.p1}–{s.p2}</span>
                      ))
                    : <span className="bk-score-empty">
                        {canScore ? "click to score" : isBye ? "BYE" : ""}
                      </span>
                  }
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

// ── Score modal ───────────────────────────────────────────────────────────────
function ScoreModal({ match, pMap, setsToWin, playerLabel, onSave, onClose }) {
  const maxSets   = setsToWin * 2 - 1; // best-of-3 → max 3 sets, best-of-5 → max 5
  const initSets  = Array.from({ length: setsToWin }, () => ({ p1: "", p2: "" }));
  const [sets, setSets]       = useState(initSets);
  const [winnerId, setWinner] = useState("");
  const [error, setError]     = useState("");

  const p1 = match.participant1Id;
  const p2 = match.participant2Id;

  // Derive winner automatically from sets when possible
  function derivedWinner(currentSets) {
    let w1 = 0, w2 = 0;
    for (const s of currentSets) {
      const a = parseInt(s.p1), b = parseInt(s.p2);
      if (isNaN(a) || isNaN(b)) continue;
      if (a > b) w1++; else if (b > a) w2++;
    }
    if (w1 >= setsToWin) return p1;
    if (w2 >= setsToWin) return p2;
    return "";
  }

  function updateSet(i, key, val) {
    const next = sets.map((s, idx) => idx === i ? { ...s, [key]: val } : s);
    setSets(next);
    const auto = derivedWinner(next);
    if (auto) setWinner(auto);
    setError("");
  }

  function addSet() {
    if (sets.length < maxSets) setSets(s => [...s, { p1: "", p2: "" }]);
  }

  function removeSet() {
    if (sets.length > 1) setSets(s => s.slice(0, -1));
  }

  function handleSave() {
    const parsed = sets.map(s => ({ p1: parseInt(s.p1), p2: parseInt(s.p2) }));
    if (parsed.some(s => isNaN(s.p1) || isNaN(s.p2))) { setError("Fill in all set scores."); return; }
    if (!winnerId) { setError("Select the winner."); return; }
    onSave(parsed, winnerId);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Enter Match Score</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="score-players">
          <span className="score-player-name">{playerLabel(p1)}</span>
          <span className="score-vs">vs</span>
          <span className="score-player-name">{playerLabel(p2)}</span>
        </div>

        <div className="score-sets">
          {sets.map((s, i) => (
            <div key={i} className="score-set-row">
              <span className="score-set-label">Set {i + 1}</span>
              <input
                className="score-input"
                type="number" min="0" max="7"
                value={s.p1}
                onChange={e => updateSet(i, "p1", e.target.value)}
                placeholder="0"
              />
              <span className="score-dash">–</span>
              <input
                className="score-input"
                type="number" min="0" max="7"
                value={s.p2}
                onChange={e => updateSet(i, "p2", e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>

        <div className="score-set-controls">
          {sets.length < maxSets && (
            <button className="btn-add-set" onClick={addSet}>+ Add set</button>
          )}
          {sets.length > 1 && (
            <button className="btn-remove-set" onClick={removeSet}>– Remove set</button>
          )}
        </div>

        <div className="score-winner">
          <div className="score-winner-label">Winner</div>
          <div className="score-winner-btns">
            <button
              className={`score-winner-btn${winnerId === p1 ? " active" : ""}`}
              onClick={() => setWinner(p1)}
            >{playerLabel(p1)}</button>
            <button
              className={`score-winner-btn${winnerId === p2 ? " active" : ""}`}
              onClick={() => setWinner(p2)}
            >{playerLabel(p2)}</button>
          </div>
        </div>

        {error && <div className="score-error">{error}</div>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save & Advance Winner</button>
        </div>
      </div>
    </div>
  );
}
