import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1772476912692 implements MigrationInterface {
    name = 'AutoMigration1772476912692'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "blog_likes" DROP CONSTRAINT "FK_blog_likes_blog_id_blogs_id"`);
        await queryRunner.query(`ALTER TABLE "blog_likes" ADD CONSTRAINT "FK_bc3c053e964f753dd07f339db35" FOREIGN KEY ("blog_id") REFERENCES "blogs"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "blog_likes" DROP CONSTRAINT "FK_bc3c053e964f753dd07f339db35"`);
        await queryRunner.query(`ALTER TABLE "blog_likes" ADD CONSTRAINT "FK_blog_likes_blog_id_blogs_id" FOREIGN KEY ("blog_id") REFERENCES "blogs"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
