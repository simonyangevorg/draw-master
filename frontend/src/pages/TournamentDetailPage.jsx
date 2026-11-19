import React, { useEffect, useState, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, apiPatch, errorMessage } from "../api";
import BracketView from "../components/BracketView";
import GroupStageView from "../components/GroupStageView";
import Sidebar from "../components/Sidebar";
import ScoreModal from "../components/ScoreModal";
import { formatScore } from "../scoreRules";
import { STATUS_BADGE, SURFACE_LABEL, TYPE_LABEL, FORMAT_LABEL, AGE_GROUP_LABEL, ENTRY_STATUS_LABEL, VISIBILITY_LABEL, CATEGORY_LABEL, STATUS_LABEL, rulesSummary, setsToWinOf, stagesOf, label } from "../constants";

export default function TournamentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tournament, setTournament]   = useState(null);
  const [allDraw, setDraw]            = useState([]);
  const [standings, setStandings]     = useState({}); // eventId → groups with rows (F-08)
  const [activeTab, setActiveTab]     = useState("overview");
  const [loading, setLoading]         = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg]                 = useState({ text: "", error: false });
  const [confirmWithdrawId, setConfirmWithdrawId] = useState(null);
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [eventId, setEventId] = useState(null); // the event being looked at (F-01)

  // What this user may do comes from the server (L-06): club admins and the
  // super-admin manage; club members (and, for now, anyone on a PUBLIC one) enter.
  const isOrganiser = !!tournament?.access?.canManage;

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
      // Group tables come from the server, the same standings that decide champions.
      const grouped = (t.events ?? []).filter(e => e.drawFormat !== "SINGLE_ELIMINATION" && e.status !== "DRAFT" && e.status !== "OPEN");
      const tables = await Promise.all(grouped.map(e =>
        apiGet(`/api/tournaments/${id}/events/${e.id}/standings`).then(r => (r.ok ? r.json() : [])).catch(() => [])));
      setStandings(Object.fromEntries(grouped.map((e, i) => [e.id, tables[i]])));
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
    setConfirmDraw(false);
    setActionLoading(true);
    setMsg({ text: "" });
    const res = await apiPost(`/api/tournaments/${id}/events/${event.id}/draw`);
    if (res.ok) { await loadTournament(); flash(`Draw generated for ${event.name}!`); }
    else { flash(await errorMessage(res, "Could not generate draw"), true); }
    setActionLoading(false);
  }

  async function enroll() {
    setActionLoading(true);
    const res = await apiPost(`/api/tournaments/${id}/events/${event.id}/participants`, { playerId: user.id });
    if (res.ok) { await loadTournament(); flash("Application submitted successfully!"); }
    else { flash(await errorMessage(res, "Failed to apply"), true); }
    setActionLoading(false);
  }

  function withdrawParticipant(pid) {
    setConfirmWithdrawId(pid);
  }

  async function confirmWithdraw() {
    const pid = confirmWithdrawId;
    setConfirmWithdrawId(null);
    const res = await apiPatch(`/api/tournaments/${id}/participants/${pid}/withdraw`);
    if (res.ok) { await loadTournament(); flash("Participant withdrawn."); }
    else { flash(await errorMessage(res, "Failed to withdraw"), true); }
  }

  async function approveParticipant(pid) {
    const res = await apiPatch(`/api/tournaments/${id}/participants/${pid}/approve`);
    if (res.ok) { await loadTournament(); flash("Participant approved."); }
    else { flash(await errorMessage(res, "Failed to approve"), true); }
  }

  async function rejectParticipant(pid) {
    const res = await apiPatch(`/api/tournaments/${id}/participants/${pid}/reject`);
    if (res.ok) { await loadTournament(); flash("Participant rejected."); }
    else { flash(await errorMessage(res, "Failed to reject"), true); }
  }

  async function swapInDraw(pid1, pid2) {
    const res = await apiPost(`/api/tournaments/${id}/draw/swap`, { participantId1: pid1, participantId2: pid2 });
    if (res.ok) await loadTournament();
    else { flash(await errorMessage(res, "Swap failed"), true); }
  }

  async function scoreMatch(matchId, sets, winnerId, outcome = "COMPLETED") {
    const res = await apiPatch(`/api/tournaments/${id}/matches/${matchId}`, { sets, winnerId, outcome });
    if (res.ok) { await loadTournament(); flash("Score saved — winner advanced."); }
    else { flash(await errorMessage(res, "Failed to save score"), true); }
  }

  if (loading) return <div className="page-loading">Loading tournament…</div>;
  if (!tournament?.id) return <div className="page-loading">Tournament not found.</div>;

  const badge = STATUS_BADGE[tournament.status] ?? STATUS_BADGE.DRAFT;
  const events = tournament.events ?? [];
  const event = events.find(e => e.id === eventId) ?? events[0] ?? {};
  // Entries and matches of the event on screen.
  const participants = (tournament.participants ?? []).filter(p => p.eventId === event.id);
  const draw = allDraw.filter(m => m.eventId === event.id);
  const approvedCount = participants.filter(p => p.status === "APPROVED").length;
  const pendingEntries = participants.filter(p => p.status === "PENDING");
  const entryCount = `${approvedCount}/${event.maxParticipants}${pendingEntries.length ? ` · ${pendingEntries.length} pending` : ""}`;
  // Once any match has a result, the draw can no longer be rearranged (B-19).
  const drawLocked = draw.some(m => m.status === "COMPLETED" || m.status === "WALKOVER");
  const deadline = tournament.registrationDeadline;
  const championLabel = (pid) => {
    const p = (tournament.participants ?? []).find(x => x.id === pid);
    return p?.seed ? `Seed ${p.seed}` : pid ? pid.slice(0, 8) + "…" : "";
  };

  // Current user's participation record (if any)
  const myParticipant = participants.find(p => p.playerId === user?.id);
  const canApply = !isOrganiser && event.status === "OPEN" && !myParticipant && !!tournament.access?.canEnter;

  // Players not yet in the draw (APPROVED but no slot in any match)
  const inDrawIds = new Set(draw.flatMap(m => [m.participant1Id, m.participant2Id]).filter(Boolean));
  const drawPool  = participants.filter(p => p.status === "APPROVED" && !inDrawIds.has(p.id));

  return (
    <div className="dash-layout">
      <Sidebar />

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
              <span>👥 {entryCount}</span>
              {deadline && tournament.status === "OPEN" && <span>⏳ Entries close {deadline}</span>}
            </div>
          </div>

          {isOrganiser && (
            <div className="t-actions">
              {tournament.status === "DRAFT" && (
                <button className="btn btn-primary" onClick={openRegistration} disabled={actionLoading}>Open Registration</button>
              )}
              {event.status === "OPEN" && tournament.status !== "DRAFT" && (
                <button className="btn btn-primary" onClick={() => setConfirmDraw(true)} disabled={actionLoading || confirmDraw}>Generate Draw</button>
              )}
            </div>
          )}

        </div>

        {msg.text && (
          <div className={`alert ${msg.error ? "alert-error" : "alert-success"}`}>{msg.text}</div>
        )}

        {confirmDraw && (
          <div className="alert alert-info confirm-banner" role="alertdialog" aria-label="Confirm draw generation">
            <div>
              <strong>Generate the {event.name} draw with {approvedCount} approved player{approvedCount === 1 ? "" : "s"}?</strong>
              {" "}Entries, approvals and seeds are locked afterwards.
              {pendingEntries.length > 0 && (
                <div className="confirm-banner-note">
                  {pendingEntries.length} pending application{pendingEntries.length > 1 ? "s" : ""} will be left out
                  {": "}{pendingEntries.map(p => p.playerId.slice(0, 8) + "…").join(", ")}. Approve them first to include them.
                </div>
              )}
            </div>
            <div className="confirm-banner-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDraw(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={generateDraw} disabled={actionLoading}>Generate draw</button>
            </div>
          </div>
        )}

        {confirmWithdrawId && (
          <div className="alert alert-error" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
            <span>Withdraw this participant? This cannot be undone.</span>
            <div style={{ display: "flex", gap: ".5rem", flexShrink: 0 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmWithdrawId(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={confirmWithdraw}>Confirm Withdraw</button>
            </div>
          </div>
        )}

        {/* ── Events (F-01) ── */}
        {events.length > 0 && (
          <div className="event-tabs" role="tablist" aria-label="Events">
            {events.map(e => {
              const n = (tournament.participants ?? []).filter(p => p.eventId === e.id && p.status === "APPROVED").length;
              return (
                <button key={e.id} role="tab" aria-selected={e.id === event.id}
                  className={`event-tab${e.id === event.id ? " event-tab-active" : ""}`}
                  onClick={() => { setEventId(e.id); setConfirmDraw(false); }}>
                  <span className="event-tab-name">{e.name}</span>
                  <span className="event-tab-meta">{label(STATUS_LABEL, e.status)} · {n}/{e.maxParticipants}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Champion (F-08 / F-12) ── */}
        {event.status === "COMPLETED" && event.championEntryId && (
          <div className="champion-banner" role="status">
            🏆 {event.name} champion: <strong>{championLabel(event.championEntryId)}</strong>
          </div>
        )}

        {/* ── Player enrolment action bar ── */}
        {!isOrganiser && (
          <div className="enrol-bar">
            {canApply && (
              <>
                <span className="enrol-bar-text">Entries for <strong>{event.name}</strong> are open — secure your spot now.</span>
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
                <span className="enrol-bar-text">You are <strong>registered</strong> for {event.name}.</span>
                {event.status === "OPEN" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => withdrawParticipant(myParticipant.id)} disabled={actionLoading}>Withdraw</button>
                )}
              </>
            )}
            {myParticipant?.status === "REJECTED" && (
              <span className="enrol-bar-text" style={{ color: "#991b1b" }}>Your application was rejected by the organiser.</span>
            )}
            {myParticipant?.status === "WITHDRAWN" && event.status === "OPEN" && (
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
                {tournament.club && <><dt>Club</dt><dd>{tournament.club.name}</dd></>}
                <dt>Events</dt><dd>{events.map(e => e.name).join(", ") || "—"}</dd>
                <dt>Surface</dt><dd>{label(SURFACE_LABEL, tournament.surface)}</dd>
                <dt>Age Group</dt><dd>{label(AGE_GROUP_LABEL, tournament.ageGroup)}</dd>
                <dt>Entries close</dt><dd>{deadline || "When the draw is made"}</dd>
                {tournament.venue && <><dt>Venue</dt><dd>{tournament.venue}</dd></>}
                {tournament.description && <><dt>Description</dt><dd>{tournament.description}</dd></>}
              </dl>
            </div>
            <div className="detail-card">
              <h3>{event.name}</h3>
              <dl className="detail-list">
                <dt>Category</dt><dd>{label(CATEGORY_LABEL, event.category)}</dd>
                <dt>Format</dt><dd>{label(FORMAT_LABEL, event.drawFormat)}</dd>
                <dt>Entries</dt><dd>{entryCount}</dd>
                {/* Match rules per stage (F-05) */}
                {stagesOf(event.drawFormat).includes("group") && (
                  <><dt>{event.drawFormat === "ROUND_ROBIN" ? "Rules" : "Group rules"}</dt><dd>{rulesSummary(event.groupRules)}</dd></>
                )}
                {stagesOf(event.drawFormat).includes("knockout") && (
                  <><dt>{event.drawFormat === "GROUP_STAGE_KNOCKOUT" ? "Knockout rules" : "Rules"}</dt><dd>{rulesSummary(event.knockoutRules)}</dd></>
                )}
                {event.finalRules && <><dt>Final</dt><dd>{rulesSummary(event.finalRules)}</dd></>}
                <dt>Seeded</dt><dd>{event.seeded ? "Yes" : "No"}</dd>
              </dl>
            </div>
            <div className="detail-card">
              <h3>Prizes & Access</h3>
              <dl className="detail-list">
                <dt>Entry Fee</dt><dd>{tournament.entryFee ? `$${tournament.entryFee}` : "Free"}</dd>
                <dt>Prize Pool</dt><dd>{tournament.prizePool ? `$${tournament.prizePool}` : "—"}</dd>
                <dt>Ranking Points</dt><dd>{tournament.rankingPoints ?? "—"}</dd>
                <dt>Visible to</dt><dd>{label(VISIBILITY_LABEL, tournament.visibility)}</dd>
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
            tournamentStatus={event.status}
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
                <p>{event.status === "OPEN" && isOrganiser ? `The ${event.name} draw isn't generated yet.` : "Draw not available yet."}</p>
                {event.status === "OPEN" && tournament.status !== "DRAFT" && isOrganiser && (
                  <button className="btn btn-primary" onClick={() => setConfirmDraw(true)} disabled={actionLoading || confirmDraw}>Generate Draw</button>
                )}
              </div>
            ) : event.drawFormat === "GROUP_STAGE_KNOCKOUT" || event.drawFormat === "ROUND_ROBIN" ? (
              <GroupStageView
                roundRobin={event.drawFormat === "ROUND_ROBIN"}
                standings={standings[event.id] ?? []}
                tournament={{ ...tournament, ...event, groups: (tournament.groups ?? []).filter(g => g.eventId === event.id) }}
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
                drawLocked={drawLocked}
                tournamentId={id}
                setsToWin={2}
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
      <div className="table-scroll">
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
                    {label(ENTRY_STATUS_LABEL, p.status)}
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
    </div>
  );
}

// ── Draw manager (bracket + drag/drop + pool) ─────────────────────────────────
function DrawManager({ draw, participants, pool, isOrganiser, drawLocked, tournamentId, setsToWin, onSwap, onScore, onReload, flash }) {
  const pMap = Object.fromEntries(participants.map(p => [p.id, p]));
  const dragSource = useRef(null);
  const [poolOver, setPoolOver]     = useState(false);
  const [scoreMatch, setScoreMatch] = useState(null); // match object being scored
  // Tap-to-move fallback for touch devices, where native HTML5 drag-and-drop
  // (used below for mouse users) doesn't fire. Tapping a player "picks" them
  // up (mirrors dragstart), tapping a slot/pool "drops" them (mirrors drop) —
  // both routes end up going through the same dragSource-based handlers.
  const [selected, setSelected] = useState(null); // { pid, fromMatchId, fromSlot } | null

  function playerLabel(pid) {
    const p = pMap[pid];
    return p?.seed ? `Seed ${p.seed}` : pid ? pid.slice(0, 6) + "…" : "TBD";
  }

  async function patchSlot(matchId, slot, participantId) {
    const res = await apiPatch(`/api/tournaments/${tournamentId}/draw/${matchId}/slot`, { slot, participantId: participantId ?? null });
    if (res.ok) onReload();
    else { flash(await errorMessage(res, "Failed"), true); }
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

  // Tap-to-move: picking up toggles selection; dropping routes through the
  // same dragSource-based handlers used by native drag-and-drop above.
  function handleTapPick(pid, fromMatchId, fromSlot) {
    setSelected(sel =>
      sel && sel.pid === pid && sel.fromMatchId === fromMatchId ? null : { pid, fromMatchId, fromSlot }
    );
  }

  function handleTapDrop(targetMatchId, targetSlot, currentPid) {
    if (!selected) return;
    dragSource.current = selected;
    setSelected(null);
    handleDropOnSlot(targetMatchId, targetSlot, currentPid);
  }

  function handleTapRemoveToPool(e) {
    if (!selected?.fromMatchId) return;
    e.stopPropagation();
    dragSource.current = selected;
    setSelected(null);
    handleDropOnPool();
  }

  return (
    <div className="draw-manager">
      {isOrganiser && drawLocked && (
        <div className="draw-locked-note">The draw is locked now that results are in. Players can no longer be moved.</div>
      )}
      {/* Pool sidebar — shown to the organiser until the first result locks the draw */}
      {isOrganiser && !drawLocked && (
        <div
          className={`draw-pool${poolOver ? " draw-pool-over" : ""}`}
          onDragOver={e => { e.preventDefault(); setPoolOver(true); }}
          onDragLeave={() => setPoolOver(false)}
          onDrop={handleDropOnPool}
          onClick={handleTapRemoveToPool}
        >
          <div className="draw-pool-title">Available Players</div>
          <div className="draw-pool-hint">
            {pool.length === 0 ? "All players are in the draw" : "Drag onto a slot, or tap a player then tap a slot"}
          </div>
          {pool.map(p => (
            <div
              key={p.id}
              className={`draw-pool-player${selected?.pid === p.id && !selected.fromMatchId ? " draw-pool-player-selected" : ""}`}
              draggable
              onDragStart={() => { dragSource.current = { pid: p.id, fromMatchId: null, fromSlot: null }; }}
              onClick={e => {
                if (selected?.fromMatchId) { handleTapRemoveToPool(e); return; }
                e.stopPropagation();
                handleTapPick(p.id, null, null);
              }}
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
          drawLocked={drawLocked}
          dragSource={dragSource}
          onDropOnSlot={handleDropOnSlot}
          onSetBye={setBye}
          selected={selected}
          onTapPick={handleTapPick}
          onTapDrop={handleTapDrop}
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
          playerLabel={playerLabel}
          onSave={async (sets, winnerId, outcome) => {
            setScoreMatch(null);
            await onScore(scoreMatch.id, sets, winnerId, outcome);
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

function DraggableBracket({ draw, pMap, isOrganiser, drawLocked, dragSource, onDropOnSlot, onSetBye, selected, onTapPick, onTapDrop, onCardClick, playerLabel }) {
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
              const canEdit    = isOrganiser && !drawLocked && !isDone && feederResolved(match, slot, ri);
              // Only lock EMPTY slots — if a player is already placed, slot is not locked
              const isLocked   = isOrganiser && !drawLocked && !isDone && !pid && !feederResolved(match, slot, ri);
              const label      = pid
                ? playerLabel(pid)
                : isByeSlot ? "BYE"
                : fallbackLabel || "TBD";
              const isSelected = selected && selected.pid === pid && selected.fromMatchId === match.id && selected.fromSlot === slot;

              // Tap-to-move fallback for touch devices (no native drag-and-drop
              // there): with a player selected, any editable slot tap drops/swaps
              // them here. With nothing selected, a filled-but-not-yet-scorable
              // slot picks the player up instead — scoring (canScore) keeps
              // priority when both are possible, since "×" remove still offers a
              // touch path to free up an already-scorable match's slots.
              const rowOnClick = selected
                ? (canEdit ? e => { e.stopPropagation(); onTapDrop(match.id, slot, pid); } : undefined)
                : canScore
                  ? e => { if (e.target.tagName !== "BUTTON") onCardClick(match); }
                  : (canEdit && pid)
                    ? e => { e.stopPropagation(); onTapPick(pid, match.id, slot); }
                    : undefined;

              return (
                <div
                  className={[
                    "bk-player-row",
                    isWinner  ? "bk-winner"   : "",
                    isEmpty && !isByeSlot ? "bk-tbd" : "",
                    isByeSlot ? "bk-bye-row"  : "",
                    isOver    ? "bk-drop-over": "",
                    isLocked  ? "bk-locked"   : "",
                    isSelected ? "bk-selected" : "",
                  ].filter(Boolean).join(" ")}
                  draggable={canEdit && !!pid}
                  onDragStart={canEdit && pid ? () => {
                    dragSource.current = { pid, fromMatchId: match.id, fromSlot: slot };
                  } : undefined}
                  onDragOver={canEdit ? e => { e.preventDefault(); setDragOver(key); } : undefined}
                  onDragLeave={canEdit ? () => setDragOver(null) : undefined}
                  onDrop={canEdit ? () => { setDragOver(null); onDropOnSlot(match.id, slot, pid); } : undefined}
                  onClick={rowOnClick}
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
                  {isDone
                    ? <span className="bk-score-set">{formatScore(match.sets ?? [], match.outcome ?? "COMPLETED")}</span>
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
