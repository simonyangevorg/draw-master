export const STATUS_BADGE = {
  DRAFT:       { label: "Draft",       color: "#6b7280" },
  OPEN:        { label: "Open",        color: "#2d7a4f" },
  IN_PROGRESS: { label: "In Progress", color: "#d97706" },
  COMPLETED:   { label: "Completed",   color: "#1d4ed8" },
  CANCELLED:   { label: "Cancelled",   color: "#dc2626" },
};

export const TYPE_LABEL = {
  SINGLES_MEN:   "Singles Men",
  SINGLES_WOMEN: "Singles Women",
  DOUBLES_MEN:   "Doubles Men",
  DOUBLES_WOMEN: "Doubles Women",
  MIXED_DOUBLES: "Mixed Doubles",
};

export const SURFACE_LABEL = {
  CLAY:             "Clay",
  HARD_OUTDOOR:     "Hard (Outdoor)",
  HARD_INDOOR:      "Hard (Indoor)",
  GRASS:            "Grass",
  CARPET:           "Carpet",
  ACRYLIC:          "Acrylic",
  ARTIFICIAL_CLAY:  "Artificial Clay",
  ARTIFICIAL_GRASS: "Artificial Grass",
};

export const FORMAT_LABEL = {
  SINGLE_ELIMINATION:   "Single Elimination",
  DOUBLE_ELIMINATION:   "Double Elimination",
  ROUND_ROBIN:          "Round Robin",
  GROUP_STAGE_KNOCKOUT: "Groups + Knockout",
};

export const AGE_GROUP_LABEL = {
  OPEN:      "Open",
  U18:       "Under 18",
  U16:       "Under 16",
  U14:       "Under 14",
  SENIOR_40: "Seniors 40+",
};

export const ENTRY_STATUS_LABEL = {
  PENDING:   "Pending",
  APPROVED:  "Approved",
  REJECTED:  "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const ROLE_LABEL = {
  SUPER_ADMIN: "Super-admin",
  PLAYER:      "Player",
};

export const CLUB_ROLE_LABEL = {
  ADMIN:  "Club admin",
  MEMBER: "Member",
};

export const VISIBILITY_LABEL = {
  CLUB:   "Club members",
  PUBLIC: "Everyone",
};

/**
 * Not available yet: the API refuses them until doubles pairs (F-04) and
 * Double Elimination (F-10) ship, so the wizard doesn't offer them (B-17).
 */
export const UNAVAILABLE_TYPES   = ["DOUBLES_MEN", "DOUBLES_WOMEN", "MIXED_DOUBLES"];
export const UNAVAILABLE_FORMATS = ["DOUBLE_ELIMINATION"];

/** A human label for an enum value: never show the raw value (B-20). */
export function label(map, value) {
  if (value == null || value === "") return "—";
  return map[value] ?? String(value).toLowerCase().replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
}

/** An event's category (F-01). Eligibility by gender arrives with F-03. */
export const CATEGORY_LABEL = {
  MEN:   "Men",
  WOMEN: "Women",
  MIXED: "Mixed",
  OPEN:  "Open to all",
};

/** Status of a tournament or an event, in words. */
export const STATUS_LABEL = {
  DRAFT:       "Draft",
  OPEN:        "Entries open",
  IN_PROGRESS: "In play",
  COMPLETED:   "Finished",
  CANCELLED:   "Cancelled",
};

/** A tournament's events as one line: "Men's Singles, Women's Singles". */
export const eventNames = (t) => (t?.events ?? []).slice().sort((a, b) => a.position - b.position).map(e => e.name).join(", ");

// ── Match rules (F-05) ──

/** The rules used until the API's presets have loaded. */
export const DEFAULT_RULES = { bestOf: 3, gamesPerSet: 6, tiebreakAt: 6, decidingSet: "FULL", noAd: false };

export const sameRules = (a, b) =>
  !!a && !!b && ["bestOf", "gamesPerSet", "tiebreakAt", "decidingSet", "noAd"].every(k => a[k] === b[k]);

/** "Best of 3 · sets to 6 · tiebreak at 6-6 · match tiebreak to 10 · no-ad" */
export function rulesSummary(r) {
  if (!r) return "—";
  const parts = [
    r.bestOf === 1 ? "One set" : `Best of ${r.bestOf}`,
    r.gamesPerSet === 8 ? "pro set to 8" : `sets to ${r.gamesPerSet}`,
    `tiebreak at ${r.tiebreakAt}-${r.tiebreakAt}`,
  ];
  if (r.bestOf > 1 && r.decidingSet === "MATCH_TIEBREAK_10") parts.push("match tiebreak to 10 instead of a deciding set");
  if (r.noAd) parts.push("no-ad");
  return parts.join(" · ");
}

/** Sets needed to win under these rules. */
export const setsToWinOf = (r) => Math.ceil((r?.bestOf ?? 3) / 2);

/** Which stages an event's format has, for its rules (F-05). */
export const stagesOf = (drawFormat) =>
  drawFormat === "ROUND_ROBIN" ? ["group"] : drawFormat === "GROUP_STAGE_KNOCKOUT" ? ["group", "knockout"] : ["knockout"];
