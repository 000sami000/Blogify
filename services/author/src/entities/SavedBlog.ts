import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "savedblogs" })
export class SavedBlog {
  @PrimaryColumn()
  blogid!: number;

  @PrimaryColumn()
  userid!: string;
}
