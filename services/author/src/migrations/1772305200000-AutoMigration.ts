import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1772305200000 implements MigrationInterface {
  name = "AutoMigration1772305200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blogs"
      ADD COLUMN IF NOT EXISTS "publish_status" character varying NOT NULL DEFAULT 'published'
    `);
    await queryRunner.query(`
      ALTER TABLE "blogs"
      ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "blog_reports" (
        "id" SERIAL NOT NULL,
        "blog_id" integer NOT NULL,
        "reported_by" character varying NOT NULL,
        "reason" character varying NOT NULL DEFAULT 'other',
        "details" text,
        "status" character varying NOT NULL DEFAULT 'open',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blog_reports_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_blog_reports_blog_id" ON "blog_reports" ("blog_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_blog_reports_status" ON "blog_reports" ("status")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_blog_reports_blog_id_blogs_id'
        )
        THEN
          ALTER TABLE "blog_reports"
          ADD CONSTRAINT "FK_blog_reports_blog_id_blogs_id"
          FOREIGN KEY ("blog_id")
          REFERENCES "blogs"("id")
          ON DELETE CASCADE
          ON UPDATE CASCADE;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "blog_reports"
      DROP CONSTRAINT IF EXISTS "FK_blog_reports_blog_id_blogs_id"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_reports_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_reports_blog_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_reports"`);
    await queryRunner.query(`
      ALTER TABLE "blogs"
      DROP COLUMN IF EXISTS "is_active"
    `);
    await queryRunner.query(`
      ALTER TABLE "blogs"
      DROP COLUMN IF EXISTS "publish_status"
    `);
  }
}

