import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "blog_reports" })
export class BlogReport {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "blog_id", type: "integer" })
  blogId!: number;

  @Column({ name: "reported_by", type: "varchar" })
  reportedBy!: string;

  @Column({ type: "varchar", default: "other" })
  reason!: string;

  @Column({ type: "text", nullable: true })
  details?: string;

  @Column({ type: "varchar", default: "open" })
  status!: "open" | "resolved" | "dismissed";

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}

