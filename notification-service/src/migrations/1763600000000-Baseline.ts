import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1763600000000 implements MigrationInterface {
    name = 'Baseline1763600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Databases created before L-01 already hold exactly this schema: TypeORM
        // synchronize built it from these same entities. Adopt them as they are
        // (the run is still recorded), and only build the schema on an empty DB.
        const [{ existing }] = await queryRunner.query(`SELECT to_regclass('public."notifications"') IS NOT NULL AS existing`);
        if (existing) return;
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying NOT NULL DEFAULT 'sent', "recipientId" character varying NOT NULL, "channel" character varying NOT NULL, "subject" character varying NOT NULL, "body" character varying NOT NULL, "metadata" jsonb, "sentAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "notifications"`);
    }

}
