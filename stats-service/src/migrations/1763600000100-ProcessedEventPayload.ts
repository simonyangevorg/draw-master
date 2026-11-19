import { MigrationInterface, QueryRunner } from "typeorm";

export class ProcessedEventPayload1763600000100 implements MigrationInterface {
    name = 'ProcessedEventPayload1763600000100'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "processed_events" ADD "payload" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "processed_events" DROP COLUMN "payload"`);
    }

}
