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
