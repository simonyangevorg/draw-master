import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1763600000000 implements MigrationInterface {
    name = 'Baseline1763600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Databases created before L-01 already hold exactly this schema: TypeORM
        // synchronize built it from these same entities. Adopt them as they are
        // (the run is still recorded), and only build the schema on an empty DB.
        const [{ existing }] = await queryRunner.query(`SELECT to_regclass('public."participants"') IS NOT NULL AS existing`);
        if (existing) return;
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "participants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tournamentId" uuid NOT NULL, "playerId" character varying NOT NULL, "partnerId" character varying, "status" character varying NOT NULL DEFAULT 'PENDING', "seed" integer, "groupId" character varying, "registeredAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1cda06c31eec1c95b3365a0283f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ed49a1d43654faefa32e217a7f" ON "participants" ("playerId") `);
        await queryRunner.query(`CREATE TABLE "tournament_matches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tournamentId" uuid NOT NULL, "stage" character varying NOT NULL DEFAULT 'KNOCKOUT', "round" integer NOT NULL, "position" integer NOT NULL, "participant1Id" character varying, "participant2Id" character varying, "winnerId" character varying, "nextMatchId" character varying, "sets" jsonb, "status" character varying NOT NULL DEFAULT 'SCHEDULED', "groupId" character varying, "slot1" character varying, "slot2" character varying, "scheduledAt" TIMESTAMP, "completedAt" TIMESTAMP, CONSTRAINT "PK_b128bcced13707fbc4ac1519216" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tournament_groups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tournamentId" uuid NOT NULL, "name" character varying NOT NULL, "position" integer NOT NULL, "participantIds" jsonb NOT NULL DEFAULT '[]', CONSTRAINT "PK_c2f8cd1faeb19919d97022068df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "tournaments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "organiserId" character varying NOT NULL, "clubId" character varying, "venue" character varying, "city" character varying, "country" character varying, "startDate" date NOT NULL, "endDate" date NOT NULL, "registrationDeadline" date, "status" character varying NOT NULL DEFAULT 'DRAFT', "isPublic" boolean NOT NULL DEFAULT true, "requiresApproval" boolean NOT NULL DEFAULT false, "entryFee" numeric(10,2), "prizePool" numeric(10,2), "rankingPoints" integer, "tournamentType" character varying NOT NULL, "drawFormat" character varying NOT NULL, "surface" character varying NOT NULL DEFAULT 'CLAY', "ageGroup" character varying NOT NULL DEFAULT 'OPEN', "maxParticipants" integer NOT NULL DEFAULT '32', "minParticipants" integer NOT NULL DEFAULT '4', "seeded" boolean NOT NULL DEFAULT true, "setsToWin" integer NOT NULL DEFAULT '2', "gamesPerSet" integer NOT NULL DEFAULT '6', "tiebreakAt" integer NOT NULL DEFAULT '6', "finalSetTiebreak" boolean NOT NULL DEFAULT false, "noAd" boolean NOT NULL DEFAULT false, "numberOfGroups" integer, "advancePerGroup" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6d5d129da7a80cf99e8ad4833a9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "participants" ADD CONSTRAINT "FK_979e268815f610cd4572661fce5" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tournament_matches" ADD CONSTRAINT "FK_8b729ff23b080160ff0cc4a2b5f" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tournament_groups" ADD CONSTRAINT "FK_e7190bb7cdea1f2da863bf0e7c8" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tournament_groups" DROP CONSTRAINT "FK_e7190bb7cdea1f2da863bf0e7c8"`);
        await queryRunner.query(`ALTER TABLE "tournament_matches" DROP CONSTRAINT "FK_8b729ff23b080160ff0cc4a2b5f"`);
        await queryRunner.query(`ALTER TABLE "participants" DROP CONSTRAINT "FK_979e268815f610cd4572661fce5"`);
        await queryRunner.query(`DROP TABLE "tournaments"`);
        await queryRunner.query(`DROP TABLE "tournament_groups"`);
        await queryRunner.query(`DROP TABLE "tournament_matches"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ed49a1d43654faefa32e217a7f"`);
        await queryRunner.query(`DROP TABLE "participants"`);
    }

}
