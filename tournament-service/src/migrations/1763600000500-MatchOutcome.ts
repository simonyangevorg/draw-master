import { MigrationInterface, QueryRunner } from "typeorm";

export class MatchOutcome1763600000500 implements MigrationInterface {
    name = 'MatchOutcome1763600000500'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tournament_matches" ADD "outcome" character varying`);
        // F-06: results recorded before outcomes existed were played to the end, or were walkovers.
        await queryRunner.query(`UPDATE "tournament_matches" SET "outcome" = CASE "status" WHEN 'WALKOVER' THEN 'WALKOVER' ELSE 'COMPLETED' END WHERE "status" IN ('COMPLETED', 'WALKOVER')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tournament_matches" DROP COLUMN "outcome"`);
    }

}
