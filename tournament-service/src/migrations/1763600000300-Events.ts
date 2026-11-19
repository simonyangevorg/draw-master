import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F-01: a tournament holds events. Every existing tournament becomes one
 * event carrying its old format, size, seeding, group and rule settings,
 * named after its old type ("Men's Singles"), with the tournament's status.
 * Its entries, matches and groups move into that event unchanged. Then the
 * format columns leave the tournaments table.
 */
export class Events1763600000300 implements MigrationInterface {
  name = 'Events1763600000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tournamentId" uuid NOT NULL, "name" character varying NOT NULL, "position" integer NOT NULL DEFAULT '0', "category" character varying NOT NULL DEFAULT 'OPEN', "discipline" character varying NOT NULL DEFAULT 'SINGLES', "drawFormat" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'DRAFT', "maxParticipants" integer NOT NULL DEFAULT '32', "minParticipants" integer NOT NULL DEFAULT '4', "seeded" boolean NOT NULL DEFAULT true, "numberOfGroups" integer, "advancePerGroup" integer, "setsToWin" integer NOT NULL DEFAULT '2', "gamesPerSet" integer NOT NULL DEFAULT '6', "tiebreakAt" integer NOT NULL DEFAULT '6', "finalSetTiebreak" boolean NOT NULL DEFAULT false, "noAd" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_5bb110707ac06f89c85bbbafb3" ON "events" ("tournamentId") `);
    await queryRunner.query(`ALTER TABLE "events" ADD CONSTRAINT "FK_5bb110707ac06f89c85bbbafb32" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

    // One event per existing tournament, carrying its format.
    await queryRunner.query(`
      INSERT INTO "events" ("tournamentId", "name", "position", "category", "discipline", "drawFormat", "status",
        "maxParticipants", "minParticipants", "seeded", "numberOfGroups", "advancePerGroup",
        "setsToWin", "gamesPerSet", "tiebreakAt", "finalSetTiebreak", "noAd", "createdAt")
      SELECT "id",
        CASE "tournamentType"
          WHEN 'SINGLES_MEN' THEN 'Men''s Singles' WHEN 'SINGLES_WOMEN' THEN 'Women''s Singles'
          WHEN 'DOUBLES_MEN' THEN 'Men''s Doubles' WHEN 'DOUBLES_WOMEN' THEN 'Women''s Doubles'
          WHEN 'MIXED_DOUBLES' THEN 'Mixed Doubles' ELSE 'Main event' END,
        0,
        CASE "tournamentType" WHEN 'SINGLES_MEN' THEN 'MEN' WHEN 'DOUBLES_MEN' THEN 'MEN'
          WHEN 'SINGLES_WOMEN' THEN 'WOMEN' WHEN 'DOUBLES_WOMEN' THEN 'WOMEN'
          WHEN 'MIXED_DOUBLES' THEN 'MIXED' ELSE 'OPEN' END,
        CASE WHEN "tournamentType" LIKE 'SINGLES%' THEN 'SINGLES' ELSE 'DOUBLES' END,
        "drawFormat", "status",
        "maxParticipants", "minParticipants", "seeded", "numberOfGroups", "advancePerGroup",
        "setsToWin", "gamesPerSet", "tiebreakAt", "finalSetTiebreak", "noAd", "createdAt"
      FROM "tournaments"`);

    // Entries, matches and groups join their tournament's event.
    for (const table of ['participants', 'tournament_matches', 'tournament_groups']) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD "eventId" character varying`);
      await queryRunner.query(`UPDATE "${table}" x SET "eventId" = e."id"::text FROM "events" e WHERE e."tournamentId" = x."tournamentId"`);
      await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "eventId" SET NOT NULL`);
    }
    await queryRunner.query(`CREATE INDEX "IDX_a622804301e735196918e6a47e" ON "participants" ("eventId") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0af412771b69be6539624ad83f" ON "participants" ("eventId", "playerId") `);
    await queryRunner.query(`CREATE INDEX "IDX_e30d819d3bd115822704453ca0" ON "tournament_matches" ("eventId") `);
    await queryRunner.query(`CREATE INDEX "IDX_42c31654e89f0903da2dba34fa" ON "tournament_groups" ("eventId") `);

    for (const column of ['tournamentType', 'drawFormat', 'maxParticipants', 'minParticipants', 'seeded', 'setsToWin',
      'gamesPerSet', 'tiebreakAt', 'finalSetTiebreak', 'noAd', 'numberOfGroups', 'advancePerGroup']) {
      await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN "${column}"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Back to one format per tournament: each takes its first event's settings.
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "tournamentType" character varying`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "drawFormat" character varying`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "maxParticipants" integer NOT NULL DEFAULT '32'`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "minParticipants" integer NOT NULL DEFAULT '4'`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "seeded" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "setsToWin" integer NOT NULL DEFAULT '2'`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "gamesPerSet" integer NOT NULL DEFAULT '6'`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "tiebreakAt" integer NOT NULL DEFAULT '6'`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "finalSetTiebreak" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "noAd" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "numberOfGroups" integer`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "advancePerGroup" integer`);
    await queryRunner.query(`
      UPDATE "tournaments" t SET
        "tournamentType" = CASE WHEN e."discipline" = 'SINGLES' AND e."category" = 'WOMEN' THEN 'SINGLES_WOMEN'
                                WHEN e."discipline" = 'SINGLES' THEN 'SINGLES_MEN'
                                WHEN e."category" = 'WOMEN' THEN 'DOUBLES_WOMEN'
                                WHEN e."category" = 'MIXED' THEN 'MIXED_DOUBLES' ELSE 'DOUBLES_MEN' END,
        "drawFormat" = e."drawFormat", "maxParticipants" = e."maxParticipants", "minParticipants" = e."minParticipants",
        "seeded" = e."seeded", "setsToWin" = e."setsToWin", "gamesPerSet" = e."gamesPerSet", "tiebreakAt" = e."tiebreakAt",
        "finalSetTiebreak" = e."finalSetTiebreak", "noAd" = e."noAd",
        "numberOfGroups" = e."numberOfGroups", "advancePerGroup" = e."advancePerGroup"
      FROM (SELECT DISTINCT ON ("tournamentId") * FROM "events" ORDER BY "tournamentId", "position") e
      WHERE e."tournamentId" = t."id"`);
    await queryRunner.query(`UPDATE "tournaments" SET "tournamentType" = 'SINGLES_MEN' WHERE "tournamentType" IS NULL`);
    await queryRunner.query(`UPDATE "tournaments" SET "drawFormat" = 'SINGLE_ELIMINATION' WHERE "drawFormat" IS NULL`);
    await queryRunner.query(`ALTER TABLE "tournaments" ALTER COLUMN "tournamentType" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "tournaments" ALTER COLUMN "drawFormat" SET NOT NULL`);
    await queryRunner.query(`DROP INDEX "public"."IDX_42c31654e89f0903da2dba34fa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e30d819d3bd115822704453ca0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0af412771b69be6539624ad83f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a622804301e735196918e6a47e"`);
    await queryRunner.query(`ALTER TABLE "tournament_groups" DROP COLUMN "eventId"`);
    await queryRunner.query(`ALTER TABLE "tournament_matches" DROP COLUMN "eventId"`);
    await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "eventId"`);
    await queryRunner.query(`DROP TABLE "events"`);
  }
}
