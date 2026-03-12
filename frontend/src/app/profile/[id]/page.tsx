import PublicProfileClient from "@/features/profile/public/PublicProfileClient";
import {
  defaultPublicBlogsResponse,
  defaultPublicBlogStats,
  PublicBlogStats,
  PublicProfileBlogsResponse,
  PublicProfileUser,
} from "@/features/profile/public/types";
import { toCount } from "@/features/profile/shared/metrics";
import {
  generateVisitorId,
  isValidVisitorId,
  VISITOR_ID_COOKIE,
} from "@/lib/visitor-id";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";

interface UserProfilePageProps {
  params: Promise<{ id: string }>;
}

const userService = process.env.NEXT_PUBLIC_USER_SERVICE;
const blogService = process.env.NEXT_PUBLIC_BLOG_SERVICE;

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const UserProfilePage = async ({ params }: UserProfilePageProps) => {
  const { id } = await params;

  if (!id || !userService || !blogService) {
    return (
      <PublicProfileClient
        initialProfile={null}
        initialBlogStats={defaultPublicBlogStats}
        initialBlogs={defaultPublicBlogsResponse}
        profileId={id ?? ""}
        viewerUserId={null}
      />
    );
  }

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

  let viewerUserId: string | null = null;
  if (token) {
    const me = await fetchJson<{ _id?: string }>(`${userService}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    viewerUserId = typeof me?._id === "string" ? me._id : null;
  }

  const profileUrl = new URL(`${userService}/api/v1/user/${id}`);
  if (!viewerUserId || viewerUserId !== id) {
    profileUrl.searchParams.set("incrementVisit", "1");
  }

  const profileHeaders: Record<string, string> = {};
  if (token) {
    profileHeaders.Authorization = `Bearer ${token}`;
  }
  if (visitorId) {
    profileHeaders["x-visitor-id"] = visitorId;
  }

  const profile = await fetchJson<PublicProfileUser>(
    profileUrl.toString(),
    Object.keys(profileHeaders).length > 0
      ? {
          headers: profileHeaders,
        }
      : undefined
  );

  const rawStats = await fetchJson<Partial<PublicBlogStats>>(`${blogService}/api/v1/blog/user/${id}/stats`);
  const rawBlogs = await fetchJson<Partial<PublicProfileBlogsResponse>>(
    `${blogService}/api/v1/blog/user/${id}/public?page=1&limit=6`
  );

  const initialBlogStats: PublicBlogStats = {
    totalBlogs: toCount(rawStats?.totalBlogs),
    totalLikes: toCount(rawStats?.totalLikes),
    totalViews: toCount(rawStats?.totalViews),
  };

  const initialBlogs: PublicProfileBlogsResponse = {
    items: Array.isArray(rawBlogs?.items) ? rawBlogs.items : [],
    page: toCount(rawBlogs?.page) || 1,
    limit: toCount(rawBlogs?.limit) || 6,
    total: toCount(rawBlogs?.total),
    hasMore: Boolean(rawBlogs?.hasMore),
  };

  return (
    <PublicProfileClient
      initialProfile={profile}
      initialBlogStats={initialBlogStats}
      initialBlogs={rawBlogs ? initialBlogs : defaultPublicBlogsResponse}
      profileId={id}
      viewerUserId={viewerUserId}
      initialVisitorId={visitorId}
    />
  );
};

export default UserProfilePage;
