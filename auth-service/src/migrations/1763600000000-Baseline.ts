import { MigrationInterface, QueryRunner } from "typeorm";

export class Baseline1763600000000 implements MigrationInterface {
    name = 'Baseline1763600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Databases created before L-01 already hold exactly this schema: TypeORM
        // synchronize built it from these same entities. Adopt them as they are
        // (the run is still recorded), and only build the schema on an empty DB.
        const [{ existing }] = await queryRunner.query(`SELECT to_regclass('public."users"') IS NOT NULL AS existing`);
        if (existing) return;
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'GUEST', "clubId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
