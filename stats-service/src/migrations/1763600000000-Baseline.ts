import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1763600000000 implements MigrationInterface {
    name = 'Baseline1763600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Databases created before L-01 already hold exactly this schema: TypeORM
        // synchronize built it from these same entities. Adopt them as they are
        // (the run is still recorded), and only build the schema on an empty DB.
        const [{ existing }] = await queryRunner.query(`SELECT to_regclass('public."player_stats"') IS NOT NULL AS existing`);
        if (existing) return;
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "player_stats" ("playerId" character varying NOT NULL, "matchesPlayed" integer NOT NULL DEFAULT '0', "wins" integer NOT NULL DEFAULT '0', "losses" integer NOT NULL DEFAULT '0', "setsWon" integer NOT NULL DEFAULT '0', "setsLost" integer NOT NULL DEFAULT '0', "surfaceWins" jsonb NOT NULL, "tournamentWins" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_8a1fe384eabdf0ce46a2663892c" PRIMARY KEY ("playerId"))`);
        await queryRunner.query(`CREATE TABLE "h2h_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "playerId" character varying NOT NULL, "opponentId" character varying NOT NULL, "wins" integer NOT NULL DEFAULT '0', "losses" integer NOT NULL DEFAULT '0', CONSTRAINT "UQ_2cc59932fe0952390f86f07a102" UNIQUE ("playerId", "opponentId"), CONSTRAINT "PK_2f67156a560383be29ce3c82aaa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "processed_events" ("matchId" character varying NOT NULL, "processedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_dab39639df5fd725ad047937056" PRIMARY KEY ("matchId"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "processed_events"`);
        await queryRunner.query(`DROP TABLE "h2h_records"`);
        await queryRunner.query(`DROP TABLE "player_stats"`);
    }

}
