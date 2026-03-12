 import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1772304100000 implements MigrationInterface {
  name = "AutoMigration1772304100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "blog_likes" bl
      WHERE NOT EXISTS (
        SELECT 1
        FROM "blogs" b
        WHERE b."id" = bl."blog_id"
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.blog_likes') IS NOT NULL
           AND to_regclass('public.blogs') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM pg_constraint
             WHERE conname = 'FK_blog_likes_blog_id_blogs_id'
           )
        THEN
          ALTER TABLE "blog_likes"
          ADD CONSTRAINT "FK_blog_likes_blog_id_blogs_id"
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
      ALTER TABLE "blog_likes"
      DROP CONSTRAINT IF EXISTS "FK_blog_likes_blog_id_blogs_id"
    `);
  }
}

