import { MigrationInterface, QueryRunner } from "typeorm";

export class MatchNextSlot1763600000100 implements MigrationInterface {
    name = 'MatchNextSlot1763600000100'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tournament_matches" ADD "nextSlot" integer`);
        // Existing draws: the slot follows from the bracket position (B-09).
        await queryRunner.query(`UPDATE "tournament_matches" SET "nextSlot" = CASE WHEN "position" % 2 = 0 THEN 1 ELSE 2 END WHERE "nextMatchId" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tournament_matches" DROP COLUMN "nextSlot"`);
    }

}
