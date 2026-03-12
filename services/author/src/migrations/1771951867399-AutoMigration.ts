import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1771951867399 implements MigrationInterface {
    name = 'AutoMigration1771951867399'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "blogs" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "description" character varying NOT NULL, "image" character varying NOT NULL, "blogcontent" text NOT NULL, "category" character varying NOT NULL, "author" character varying NOT NULL, "create_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e113335f11c926da929a625f118" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "savedblogs" ("blogid" integer NOT NULL, "userid" character varying NOT NULL, CONSTRAINT "PK_ffcb0d4d1bcabfaf2b80e9e2717" PRIMARY KEY ("blogid", "userid"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "savedblogs"`);
        await queryRunner.query(`DROP TABLE "blogs"`);
    }

}
