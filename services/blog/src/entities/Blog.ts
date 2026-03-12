import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "blogs" })
export class Blog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column()
  description!: string;

  @Column({ nullable: true })
  image?: string;

  @Column({ type: "jsonb" })
  blogcontent!: any;

  @Column()
  category!: string;

  @Column()
  author!: string;

  @Column({ name: "publish_status", type: "varchar", default: "published" })
  publishStatus!: "draft" | "published";

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  @Column({ name: "views_count", type: "integer", default: 0 })
  viewsCount!: number;

  @Column({ name: "likes_count", type: "integer", default: 0 })
  likesCount!: number;

  @CreateDateColumn({ name: "create_at" })
  createAt!: Date;
  
  @UpdateDateColumn({ name: "update_at" })
  updateAt!: Date;
}
