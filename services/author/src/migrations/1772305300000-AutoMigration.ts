import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1772305300000 implements MigrationInterface {
  name = "AutoMigration1772305300000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "blog_view_stats" (
        "id" SERIAL NOT NULL,
        "blog_id" integer NOT NULL,
        "day" date NOT NULL,
        "views_count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_blog_view_stats_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_blog_view_stats_blog_day" UNIQUE ("blog_id", "day")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_blog_view_stats_blog_id" ON "blog_view_stats" ("blog_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_blog_view_stats_day" ON "blog_view_stats" ("day")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_blog_view_stats_blog_id_blogs_id'
        )
        THEN
          ALTER TABLE "blog_view_stats"
          ADD CONSTRAINT "FK_blog_view_stats_blog_id_blogs_id"
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
      ALTER TABLE "blog_view_stats"
      DROP CONSTRAINT IF EXISTS "FK_blog_view_stats_blog_id_blogs_id"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_view_stats_day"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_blog_view_stats_blog_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "blog_view_stats"`);
  }
}

