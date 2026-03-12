import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { Blog } from "./Blog.js";

@Entity({ name: "blog_view_stats" })
@Unique("UQ_blog_view_stats_blog_day", ["blogId", "day"])
export class BlogViewStat {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "blog_id", type: "integer" })
  @Index("IDX_blog_view_stats_blog_id")
  blogId!: number;

  @ManyToOne(() => Blog, {
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  })
  @JoinColumn({ name: "blog_id" })
  blog!: Blog;

  @Column({ type: "date" })
  @Index("IDX_blog_view_stats_day")
  day!: string;

  @Column({ name: "views_count", type: "integer", default: 0 })
  viewsCount!: number;
}

