import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1773078006704 implements MigrationInterface {
    name = 'AutoMigration1773078006704'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "blog_reports" DROP CONSTRAINT "FK_blog_reports_blog_id_blogs_id"`);
        await queryRunner.query(`ALTER TABLE "blog_view_stats" DROP CONSTRAINT "FK_blog_view_stats_blog_id_blogs_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_blog_reports_blog_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_blog_reports_status"`);
        await queryRunner.query(`ALTER TABLE "blog_view_stats" ADD CONSTRAINT "FK_f039dad40c642b6dbb75a480de1" FOREIGN KEY ("blog_id") REFERENCES "blogs"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "blog_view_stats" DROP CONSTRAINT "FK_f039dad40c642b6dbb75a480de1"`);
        await queryRunner.query(`CREATE INDEX "IDX_blog_reports_status" ON "blog_reports" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_blog_reports_blog_id" ON "blog_reports" ("blog_id") `);
        await queryRunner.query(`ALTER TABLE "blog_view_stats" ADD CONSTRAINT "FK_blog_view_stats_blog_id_blogs_id" FOREIGN KEY ("blog_id") REFERENCES "blogs"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "blog_reports" ADD CONSTRAINT "FK_blog_reports_blog_id_blogs_id" FOREIGN KEY ("blog_id") REFERENCES "blogs"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
