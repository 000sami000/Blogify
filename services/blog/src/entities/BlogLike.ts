import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Blog } from "./Blog.js";

@Entity({ name: "blog_likes" })
@Unique("UQ_blog_likes_blog_user", ["blogId", "userId"])
export class BlogLike {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "blog_id", type: "integer" })
  blogId!: number;

  @ManyToOne(() => Blog, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "blog_id" })
  blog!: Blog;

  @Column({ name: "user_id", type: "varchar" })
  userId!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
