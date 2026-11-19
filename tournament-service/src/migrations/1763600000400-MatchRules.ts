import { MigrationInterface, QueryRunner } from 'typeorm';
import { BUILT_IN_PRESETS } from '../tournaments/rules';

/**
 * F-05: match rules per stage, and presets.
 * - Each event's single set of rules (setsToWin, gamesPerSet, tiebreakAt,
 *   finalSetTiebreak, noAd) becomes its groupRules and knockoutRules:
 *   bestOf = setsToWin * 2 - 1; a final-set tiebreak becomes a match
 *   tiebreak to 10 as the deciding set. No final override.
 * - match_rule_presets, seeded with the built-in presets (clubId NULL).
 */
export class MatchRules1763600000400 implements MigrationInterface {
  name = 'MatchRules1763600000400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "match_rule_presets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" character varying, "name" character varying NOT NULL, "rules" jsonb NOT NULL, "createdBy" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7569191c953ee9cba546dff8ea2" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_d0a5e3be04e0c9121eb16f08cb" ON "match_rule_presets" ("clubId") `);
    // One row each, in order, so the list reads as written.
    for (const [i, p] of BUILT_IN_PRESETS.entries()) {
      await queryRunner.query(
        `INSERT INTO "match_rule_presets" ("clubId", "name", "rules", "createdAt") VALUES (NULL, $1, $2, now() + ($3 || ' milliseconds')::interval)`,
        [p.name, JSON.stringify(p.rules), String(i)],
      );
    }

    await queryRunner.query(`ALTER TABLE "events" ADD "groupRules" jsonb`);
    await queryRunner.query(`ALTER TABLE "events" ADD "knockoutRules" jsonb`);
    await queryRunner.query(`ALTER TABLE "events" ADD "finalRules" jsonb`);
    await queryRunner.query(`
      UPDATE "events" SET "knockoutRules" = jsonb_build_object(
        'bestOf', LEAST(GREATEST("setsToWin", 1), 3) * 2 - 1,
        'gamesPerSet', "gamesPerSet",
        'tiebreakAt', LEAST("tiebreakAt", "gamesPerSet"),
        'decidingSet', CASE WHEN "finalSetTiebreak" AND "setsToWin" > 1 THEN 'MATCH_TIEBREAK_10' ELSE 'FULL' END,
        'noAd', "noAd")`);
    await queryRunner.query(`UPDATE "events" SET "groupRules" = "knockoutRules"`);
    await queryRunner.query(`ALTER TABLE "events" ALTER COLUMN "groupRules" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "events" ALTER COLUMN "knockoutRules" SET NOT NULL`);
    for (const column of ['setsToWin', 'gamesPerSet', 'tiebreakAt', 'finalSetTiebreak', 'noAd']) {
      await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "${column}"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Back to one set of rules per event: the knockout rules.
    await queryRunner.query(`ALTER TABLE "events" ADD "setsToWin" integer NOT NULL DEFAULT '2'`);
    await queryRunner.query(`ALTER TABLE "events" ADD "gamesPerSet" integer NOT NULL DEFAULT '6'`);
    await queryRunner.query(`ALTER TABLE "events" ADD "tiebreakAt" integer NOT NULL DEFAULT '6'`);
    await queryRunner.query(`ALTER TABLE "events" ADD "finalSetTiebreak" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "events" ADD "noAd" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`
      UPDATE "events" SET
        "setsToWin" = (("knockoutRules"->>'bestOf')::int + 1) / 2,
        "gamesPerSet" = LEAST(("knockoutRules"->>'gamesPerSet')::int, 6),
        "tiebreakAt" = ("knockoutRules"->>'tiebreakAt')::int,
        "finalSetTiebreak" = ("knockoutRules"->>'decidingSet') = 'MATCH_TIEBREAK_10',
        "noAd" = ("knockoutRules"->>'noAd')::boolean`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "finalRules"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "knockoutRules"`);
    await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "groupRules"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d0a5e3be04e0c9121eb16f08cb"`);
    await queryRunner.query(`DROP TABLE "match_rule_presets"`);
  }
}
