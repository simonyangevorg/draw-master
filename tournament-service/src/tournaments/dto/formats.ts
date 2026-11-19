/**
 * What can be created today. Double Elimination and doubles/mixed exist in the
 * model but aren't implemented (F-10, F-04); until they are, the API refuses
 * them rather than silently building a singles Single Elimination draw (B-17).
 */
export const SUPPORTED_TYPES = ['SINGLES_MEN', 'SINGLES_WOMEN'];
export const SUPPORTED_FORMATS = ['SINGLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'];
export const SURFACES = ['CLAY', 'HARD_OUTDOOR', 'HARD_INDOOR', 'GRASS', 'CARPET', 'ACRYLIC', 'ARTIFICIAL_CLAY', 'ARTIFICIAL_GRASS'];
export const AGE_GROUPS = ['OPEN', 'U18', 'U16', 'U14', 'SENIOR_40'];

/** The pre-F-01 tournamentType as an event's category + discipline + default name. */
export const TYPE_TO_EVENT: Record<string, { category: string; discipline: string; name: string }> = {
  SINGLES_MEN: { category: 'MEN', discipline: 'SINGLES', name: "Men's Singles" },
  SINGLES_WOMEN: { category: 'WOMEN', discipline: 'SINGLES', name: "Women's Singles" },
  DOUBLES_MEN: { category: 'MEN', discipline: 'DOUBLES', name: "Men's Doubles" },
  DOUBLES_WOMEN: { category: 'WOMEN', discipline: 'DOUBLES', name: "Women's Doubles" },
  MIXED_DOUBLES: { category: 'MIXED', discipline: 'DOUBLES', name: 'Mixed Doubles' },
};
