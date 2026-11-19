import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * L-02 / L-03: platform roles become SUPER_ADMIN | PLAYER, and clubs with
 * their memberships arrive.
 *
 * - ORGANISER, MEMBER and GUEST all become PLAYER. Running tournaments is now
 *   a club-admin seat: after deploying, the super-admin opens the club and
 *   appoints its admins at /admin/clubs (runbook §3b).
 * - users.clubId (free text typed at sign-up, never checked) is dropped.
 * - users.mustChangePassword is set for the bootstrapped super-admin.
 */
export class RolesAndClubs1763600000200 implements MigrationInterface {
  name = 'RolesAndClubs1763600000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "users" SET "role" = 'PLAYER' WHERE "role" IN ('ORGANISER', 'MEMBER', 'GUEST')`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'PLAYER'`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "clubId"`);
    await queryRunner.query(`ALTER TABLE "users" ADD "mustChangePassword" boolean NOT NULL DEFAULT false`);

    await queryRunner.query(`CREATE TABLE "clubs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "city" character varying, "country" character varying, "contactEmail" character varying, "logoUrl" character varying, "status" character varying NOT NULL DEFAULT 'ACTIVE', "createdBy" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5faeec2f663968ba35f61fe46d6" UNIQUE ("name"), CONSTRAINT "UQ_11a81774605896dbb29c9e53605" UNIQUE ("slug"), CONSTRAINT "PK_bb09bd0c8d5238aeaa8f86ee0d4" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE "club_memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" character varying NOT NULL, "userId" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'MEMBER', "status" character varying NOT NULL DEFAULT 'PENDING', "message" character varying, "decidedBy" character varying, "decidedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9477d0dd52aeb1544fa933dcdd8" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_b83fde2704ff041acb91f1966c" ON "club_memberships" ("clubId") `);
    await queryRunner.query(`CREATE INDEX "IDX_4ee82147354b6a7a0666b9c139" ON "club_memberships" ("userId") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_66f3cb44c8aa7069ae03d78c0b" ON "club_memberships" ("clubId", "userId") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "club_memberships"`);
    await queryRunner.query(`DROP TABLE "clubs"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mustChangePassword"`);
    await queryRunner.query(`ALTER TABLE "users" ADD "clubId" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'GUEST'`);
    // The old ORGANISER/MEMBER/GUEST split can't be recovered; everyone stays PLAYER.
  }
}
