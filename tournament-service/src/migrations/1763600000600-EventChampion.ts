import { MigrationInterface, QueryRunner } from "typeorm";

export class EventChampion1763600000600 implements MigrationInterface {
    name = 'EventChampion1763600000600'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" ADD "championEntryId" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "events" DROP COLUMN "championEntryId"`);
    }

}
