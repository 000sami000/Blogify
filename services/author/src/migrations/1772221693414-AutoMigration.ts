import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1772221693414 implements MigrationInterface {
    name = 'AutoMigration1772221693414'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "blog_likes" ("id" SERIAL NOT NULL, "blog_id" integer NOT NULL, "user_id" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_blog_likes_blog_user" UNIQUE ("blog_id", "user_id"), CONSTRAINT "PK_92ed5e155b9560753110e73c11f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "blogs" ADD "views_count" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "blogs" ADD "likes_count" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "blogs" DROP COLUMN "likes_count"`);
        await queryRunner.query(`ALTER TABLE "blogs" DROP COLUMN "views_count"`);
        await queryRunner.query(`DROP TABLE "blog_likes"`);
    }

}
