import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1772192873623 implements MigrationInterface {
    name = 'AutoMigration1772192873623'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "blogs" ADD "update_at" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "blogs" ALTER COLUMN "image" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "blogs" ALTER COLUMN "image" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "blogs" DROP COLUMN "update_at"`);
    }

}
