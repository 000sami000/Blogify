import BlogDetailClient from "./BlogDetailClient";
import { blog_service, type Blog, type User } from "@/context/app-shared";
import { cookies, headers } from "next/headers";
import {
  generateVisitorId,
  isValidVisitorId,
  VISITOR_ID_COOKIE,
} from "@/lib/visitor-id";

interface BlogPageProps {
  params: Promise<{ id: string }>;
}

interface SingleBlogResponse {
  blog?: Blog | null;
  author?: User | null;
}

const getInitialBlogPayload = async (id: string) => {
  if (!blog_service) {
    return {
      initialBlog: null as Blog | null,
      initialAuthor: null as User | null,
    };
  }

  try {
    const cookieStore = await cookies();
    const requestHeaders = await headers();
    const token = cookieStore.get("token")?.value;
    const rawVisitorId =
      cookieStore.get(VISITOR_ID_COOKIE)?.value ??
      requestHeaders.get("x-visitor-id") ??
      undefined;
    const visitorId = isValidVisitorId(rawVisitorId)
      ? rawVisitorId
      : generateVisitorId();
    const outboundHeaders: Record<string, string> = {};

    if (token) {
      outboundHeaders.Authorization = `Bearer ${token}`;
    }

    outboundHeaders["x-visitor-id"] = visitorId;

    const response = await fetch(`${blog_service}/api/v1/blog/${id}`, {
      cache: "no-store",
      headers:
        Object.keys(outboundHeaders).length > 0 ? outboundHeaders : undefined,
    });

    if (!response.ok) {
      return {
        initialBlog: null as Blog | null,
        initialAuthor: null as User | null,
      };
    }

    const data = (await response.json()) as SingleBlogResponse;
    return {
      initialBlog: data.blog ?? null,
      initialAuthor: data.author ?? null,
    };
  } catch {
    return {
      initialBlog: null as Blog | null,
      initialAuthor: null as User | null,
    };
  }
};

const BlogPage = async ({ params }: BlogPageProps) => {
  const { id } = await params;
  const { initialBlog, initialAuthor } = await getInitialBlogPayload(id);

  return (
    <BlogDetailClient
      blogId={id}
      initialBlog={initialBlog}
      initialAuthor={initialAuthor}
    />
  );
};

export default BlogPage;
