import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * B-12: emails become case-insensitive. Existing addresses are trimmed and
 * lower-cased, then a unique index on lower(email) stops "A@x.com" and
 * "a@x.com" from ever being two accounts again.
 *
 * If two existing accounts differ only by case, this aborts (the whole boot
 * fails, nothing is changed) and lists them: which one to keep is a human
 * decision. Merge or rename them by hand, then redeploy.
 */
export class EmailLowercase1763600000100 implements MigrationInterface {
  name = 'EmailLowercase1763600000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const clashes: { email: string; ids: string }[] = await queryRunner.query(
      `SELECT lower(trim("email")) AS email, string_agg("id"::text, ', ') AS ids
         FROM "users" GROUP BY lower(trim("email")) HAVING count(*) > 1`,
    );
    if (clashes.length) {
      throw new Error(
        'EmailLowercase: these accounts differ only by email case; resolve them by hand first:\n' +
          clashes.map((c) => `  ${c.email}: ${c.ids}`).join('\n'),
      );
    }
    await queryRunner.query(`UPDATE "users" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email_lower" ON "users" (lower("email"))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_users_email_lower"`);
  }
}
