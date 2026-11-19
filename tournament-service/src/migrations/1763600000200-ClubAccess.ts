import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * L-06: tournaments are governed by their club.
 * - organiserId → createdBy (renamed in place: values kept, audit only now).
 * - isPublic → visibility: public rows become PUBLIC, private ones CLUB, and
 *   CLUB is the default for new rows.
 * - clubs: tournament-service's copy of club names/status (from club.upserted).
 * Existing rows keep clubId NULL until L-07 assigns them to a club; until
 * then their creator manages them (access.ts).
 */
export class ClubAccess1763600000200 implements MigrationInterface {
  name = 'ClubAccess1763600000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "clubs" ("id" character varying NOT NULL, "name" character varying NOT NULL, "slug" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'ACTIVE', "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bb09bd0c8d5238aeaa8f86ee0d4" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "tournaments" RENAME COLUMN "organiserId" TO "createdBy"`);
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "visibility" character varying NOT NULL DEFAULT 'CLUB'`);
    await queryRunner.query(`UPDATE "tournaments" SET "visibility" = CASE WHEN "isPublic" THEN 'PUBLIC' ELSE 'CLUB' END`);
    await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN "isPublic"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tournaments" ADD "isPublic" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`UPDATE "tournaments" SET "isPublic" = ("visibility" = 'PUBLIC')`);
    await queryRunner.query(`ALTER TABLE "tournaments" DROP COLUMN "visibility"`);
    await queryRunner.query(`ALTER TABLE "tournaments" RENAME COLUMN "createdBy" TO "organiserId"`);
    await queryRunner.query(`DROP TABLE "clubs"`);
  }
}
