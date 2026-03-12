"use client";

import InsightFilters, {
  buildInsightParams,
  InsightFilterValue,
} from "@/components/charts/InsightFilters";
import InsightsLineChart, { InsightPoint } from "@/components/charts/InsightsLineChart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { author_service, blog_service, Blog, useAppData, user_service } from "@/context/AppContext";
import { getApiErrorMessage } from "@/lib/api-error";
import { getAuthToken } from "@/lib/auth-token";
import { confirmBlogDelete } from "@/lib/confirm-delete";
import axios from "axios";
import { BarChart3, ChartNoAxesCombined, ExternalLink, Flag, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

type AdminTab = "insights" | "users" | "blogs" | "reports";
type ReportStatus = "open" | "resolved" | "dismissed";

interface PaginationPayload<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface AdminUserItem {
  _id: string;
  name: string;
  email: string;
  role?: "user" | "admin";
  isBanned?: boolean;
  isActive?: boolean;
  profileVisits?: number;
  createdAt?: string;
}

interface AdminReportItem {
  id: number;
  blogId: number;
  reportedBy: string;
  reason: string;
  details?: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  blogTitle?: string;
  blogAuthor?: string;
  blogPublishStatus?: string;
  blogIsActive?: boolean;
}

interface UserInsightsResponse {
  totals?: {
    users?: number;
    activeUsers?: number;
    bannedUsers?: number;
    inactiveUsers?: number;
    adminUsers?: number;
  };
  periods?: {
    weekly?: number;
    monthly?: number;
    yearly?: number;
  };
  series?: {
    granularity?: "day" | "month" | "year";
    registrations?: InsightPoint[];
  };
}

interface BlogInsightsResponse {
  totals?: {
    blogs?: number;
    publishedBlogs?: number;
    draftBlogs?: number;
    activeBlogs?: number;
    inactiveBlogs?: number;
    openReports?: number;
  };
  periods?: {
    weekly?: number;
    monthly?: number;
    yearly?: number;
  };
  series?: {
    granularity?: "day" | "month" | "year";
    blogAdds?: InsightPoint[];
    blogViews?: InsightPoint[];
  };
}

interface UserBlogListState {
  items: Blog[];
  page: number;
  hasMore: boolean;
  loading: boolean;
}

const createEmptyPagination = <T,>(): PaginationPayload<T> => ({
  items: [],
  page: 1,
  limit: 20,
  total: 0,
  hasMore: false,
});

const createEmptyUserBlogState = (): UserBlogListState => ({
  items: [],
  page: 1,
  hasMore: false,
  loading: false,
});

const normalizePagination = <T,>(value: Partial<PaginationPayload<T>> | null | undefined) => ({
  items: Array.isArray(value?.items) ? value.items : [],
  page: typeof value?.page === "number" && value.page > 0 ? value.page : 1,
  limit: typeof value?.limit === "number" && value.limit > 0 ? value.limit : 20,
  total: typeof value?.total === "number" && value.total >= 0 ? value.total : 0,
  hasMore: Boolean(value?.hasMore),
});

const compact = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) >= 1_000_000) {
    return `${(safe / 1_000_000).toFixed(1).replace(/\\.0$/, "")}M`;
  }
  if (Math.abs(safe) >= 1_000) {
    return `${(safe / 1_000).toFixed(1).replace(/\\.0$/, "")}k`;
  }
  return String(safe);
};

const toDateLabel = (value?: string) => {
  if (!value) {
    return "Recent";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Recent";
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const AdminDashboardClient = () => {
  const router = useRouter();
  const { loading, isAuth, user } = useAppData();

  const [activeTab, setActiveTab] = useState<AdminTab>("insights");
  const [loadedTabs, setLoadedTabs] = useState<Record<AdminTab, boolean>>({
    insights: false,
    users: false,
    blogs: false,
    reports: false,
  });

  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const currentMonthRange = useMemo(() => {
    const [yearRaw, monthRaw] = currentMonth.split("-");
    const year = Number(yearRaw);
    const monthIndex = Number(monthRaw) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
      return { from: "", to: "" };
    }

    const start = new Date(Date.UTC(year, monthIndex, 1));
    const end = new Date(Date.UTC(year, monthIndex + 1, 0));
    const pad2 = (value: number) => String(value).padStart(2, "0");
    const from = `${start.getUTCFullYear()}-${pad2(start.getUTCMonth() + 1)}-${pad2(start.getUTCDate())}`;
    const to = `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`;
    return { from, to };
  }, [currentMonth]);
  const [insightFilter, setInsightFilter] = useState<InsightFilterValue>({
    granularity: "month",
    month: currentMonth,
    from: currentMonthRange.from,
    to: currentMonthRange.to,
  });
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [userInsights, setUserInsights] = useState<UserInsightsResponse | null>(null);
  const [blogInsights, setBlogInsights] = useState<BlogInsightsResponse | null>(null);

  const [usersSearch, setUsersSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersPage, setUsersPage] = useState(createEmptyPagination<AdminUserItem>());

  const [blogsSearch, setBlogsSearch] = useState("");
  const [blogPublishStatus, setBlogPublishStatus] = useState("");
  const [blogActivityStatus, setBlogActivityStatus] = useState("");
  const [blogsLoading, setBlogsLoading] = useState(false);
  const [blogsPage, setBlogsPage] = useState(createEmptyPagination<Blog>());

  const [reportStatus, setReportStatus] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsPage, setReportsPage] = useState(createEmptyPagination<AdminReportItem>());

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userBlogsByUserId, setUserBlogsByUserId] = useState<Record<string, UserBlogListState>>(
    {}
  );

  const authHeaders = useCallback(() => {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Unauthorized");
    }
    return {
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const userRegistrations = useMemo(
    () => (Array.isArray(userInsights?.series?.registrations) ? userInsights?.series?.registrations : []),
    [userInsights?.series?.registrations]
  );
  const blogAdds = useMemo(
    () => (Array.isArray(blogInsights?.series?.blogAdds) ? blogInsights?.series?.blogAdds : []),
    [blogInsights?.series?.blogAdds]
  );
  const blogViews = useMemo(
    () => (Array.isArray(blogInsights?.series?.blogViews) ? blogInsights?.series?.blogViews : []),
    [blogInsights?.series?.blogViews]
  );

  const fetchInsights = useCallback(async () => {
    try {
      setInsightsLoading(true);
      const headers = authHeaders();
      const params = {
        ...buildInsightParams(insightFilter),
        noCache: "1",
      };

      const [usersResult, blogsResult] = await Promise.all([
        axios.get<UserInsightsResponse>(`${user_service}/api/v1/admin/insights`, {
          headers,
          params,
        }),
        axios.get<BlogInsightsResponse>(`${blog_service}/api/v1/admin/insights`, {
          headers,
          params,
        }),
      ]);

      setUserInsights(usersResult.data ?? null);
      setBlogInsights(blogsResult.data ?? null);
      setLoadedTabs((previous) => ({ ...previous, insights: true }));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load admin insights"));
    } finally {
      setInsightsLoading(false);
    }
  }, [authHeaders, insightFilter]);

  const fetchUsers = useCallback(
    async (page = 1) => {
      try {
        setUsersLoading(true);
        const headers = authHeaders();
        const { data } = await axios.get<Partial<PaginationPayload<AdminUserItem>>>(
          `${user_service}/api/v1/admin/users`,
          {
            headers,
            params: {
              page,
              limit: usersPage.limit || 20,
              search: usersSearch.trim(),
            },
          }
        );

        setUsersPage(normalizePagination(data));
        setLoadedTabs((previous) => ({ ...previous, users: true }));
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Failed to load users"));
      } finally {
        setUsersLoading(false);
      }
    },
    [authHeaders, usersPage.limit, usersSearch]
  );

  const fetchBlogs = useCallback(
    async (page = 1) => {
      try {
        setBlogsLoading(true);
        const headers = authHeaders();
        const { data } = await axios.get<Partial<PaginationPayload<Blog>>>(
          `${blog_service}/api/v1/admin/blogs`,
          {
            headers,
            params: {
              page,
              limit: blogsPage.limit || 20,
              searchQuery: blogsSearch.trim(),
              publishStatus: blogPublishStatus,
              activity: blogActivityStatus,
            },
          }
        );

        setBlogsPage(normalizePagination(data));
        setLoadedTabs((previous) => ({ ...previous, blogs: true }));
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Failed to load blogs"));
      } finally {
        setBlogsLoading(false);
      }
    },
    [authHeaders, blogActivityStatus, blogPublishStatus, blogsPage.limit, blogsSearch]
  );

  const fetchReports = useCallback(
    async (page = 1) => {
      try {
        setReportsLoading(true);
        const headers = authHeaders();
        const { data } = await axios.get<Partial<PaginationPayload<AdminReportItem>>>(
          `${blog_service}/api/v1/admin/reports`,
          {
            headers,
            params: {
              page,
              limit: reportsPage.limit || 20,
              status: reportStatus,
            },
          }
        );

        setReportsPage(normalizePagination(data));
        setLoadedTabs((previous) => ({ ...previous, reports: true }));
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Failed to load reports"));
      } finally {
        setReportsLoading(false);
      }
    },
    [authHeaders, reportStatus, reportsPage.limit]
  );

  const fetchUserBlogs = useCallback(
    async (userId: string, page = 1, append = false) => {
      setUserBlogsByUserId((previous) => ({
        ...previous,
        [userId]: {
          ...(previous[userId] ?? createEmptyUserBlogState()),
          loading: true,
        },
      }));

      try {
        const headers = authHeaders();
        const { data } = await axios.get<{
          items?: Blog[];
          page?: number;
          hasMore?: boolean;
        }>(`${blog_service}/api/v1/blog/user/${userId}`, {
          headers,
          params: {
            page,
            limit: 20,
          },
        });

        const incomingItems = Array.isArray(data?.items) ? data.items : [];
        setUserBlogsByUserId((previous) => {
          const current = previous[userId] ?? createEmptyUserBlogState();
          const byId = new Map(
            (append ? current.items : []).map((item) => [String(item.id), item])
          );
          incomingItems.forEach((item) => {
            byId.set(String(item.id), item);
          });

          return {
            ...previous,
            [userId]: {
              items: Array.from(byId.values()),
              page: typeof data?.page === "number" && data.page > 0 ? data.page : page,
              hasMore: Boolean(data?.hasMore),
              loading: false,
            },
          };
        });
      } catch (error) {
        setUserBlogsByUserId((previous) => ({
          ...previous,
          [userId]: {
            ...(previous[userId] ?? createEmptyUserBlogState()),
            loading: false,
          },
        }));
        toast.error(getApiErrorMessage(error, "Failed to load user blogs"));
      }
    },
    [authHeaders]
  );

  const toggleUserBan = async (entry: AdminUserItem) => {
    try {
      const headers = authHeaders();
      await axios.patch(
        `${user_service}/api/v1/admin/user/${entry._id}/ban`,
        {
          isBanned: !entry.isBanned,
        },
        { headers }
      );
      toast.success(entry.isBanned ? "User unbanned" : "User banned");
      await fetchUsers(usersPage.page);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update ban status"));
    }
  };

  const toggleUserActive = async (entry: AdminUserItem) => {
    try {
      const headers = authHeaders();
      await axios.patch(
        `${user_service}/api/v1/admin/user/${entry._id}/active`,
        {
          isActive: !entry.isActive,
        },
        { headers }
      );
      toast.success(entry.isActive ? "User deactivated" : "User activated");
      await fetchUsers(usersPage.page);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update active status"));
    }
  };

  const moderateBlog = async (
    blogId: string | number,
    payload: { isActive?: boolean; publishStatus?: "draft" | "published" }
  ) => {
    try {
      const headers = authHeaders();
      await axios.patch(`${author_service}/api/v1/admin/blog/${blogId}/moderate`, payload, {
        headers,
      });
      toast.success("Blog updated");
      await Promise.all([
        fetchBlogs(blogsPage.page),
        fetchReports(reportsPage.page),
        fetchInsights(),
      ]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update blog"));
    }
  };

  const deleteBlogAsAdmin = async (
    blogId: string | number,
    blogTitle?: string
  ) => {
    if (!confirmBlogDelete(blogTitle)) {
      return;
    }

    try {
      const headers = authHeaders();
      await axios.delete(`${author_service}/api/v1/blog/${blogId}`, {
        headers,
      });
      toast.success("Blog deleted");
      await Promise.all([
        fetchBlogs(blogsPage.page),
        fetchReports(reportsPage.page),
        fetchInsights(),
      ]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to delete blog"));
    }
  };

  const updateReportStatus = async (reportId: number, status: ReportStatus) => {
    try {
      const headers = authHeaders();
      await axios.patch(
        `${blog_service}/api/v1/admin/reports/${reportId}`,
        {
          status,
        },
        { headers }
      );
      setReportsPage((previous) => ({
        ...previous,
        items: previous.items.map((item) =>
          Number(item.id) === Number(reportId) ? { ...item, status } : item
        ),
      }));
      toast.success("Report status updated");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update report status"));
    }
  };

  const toggleExpandUser = (targetUserId: string) => {
    setExpandedUserId((previous) => (previous === targetUserId ? null : targetUserId));
    if (!userBlogsByUserId[targetUserId]) {
      void fetchUserBlogs(targetUserId, 1, false);
    }
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!isAuth) {
      router.replace("/login");
      return;
    }

    if (user?.role !== "admin") {
      router.replace("/blogs");
    }
  }, [isAuth, loading, router, user?.role]);

  useEffect(() => {
    if (loading || !isAuth || user?.role !== "admin") {
      return;
    }

    if (activeTab === "insights" && !loadedTabs.insights) {
      void fetchInsights();
      return;
    }

    if (activeTab === "users" && !loadedTabs.users) {
      void fetchUsers(1);
      return;
    }

    if (activeTab === "blogs" && !loadedTabs.blogs) {
      void fetchBlogs(1);
      return;
    }

    if (activeTab === "reports" && !loadedTabs.reports) {
      void fetchReports(1);
    }
  }, [
    activeTab,
    fetchBlogs,
    fetchInsights,
    fetchReports,
    fetchUsers,
    isAuth,
    loadedTabs.blogs,
    loadedTabs.insights,
    loadedTabs.reports,
    loadedTabs.users,
    loading,
    user?.role,
  ]);

  useEffect(() => {
    if (activeTab !== "users" || !loadedTabs.users) {
      return;
    }

    const timer = setTimeout(() => {
      void fetchUsers(1);
    }, 320);

    return () => clearTimeout(timer);
  }, [activeTab, fetchUsers, loadedTabs.users, usersSearch]);

  useEffect(() => {
    if (activeTab !== "blogs" || !loadedTabs.blogs) {
      return;
    }

    const timer = setTimeout(() => {
      void fetchBlogs(1);
    }, 320);

    return () => clearTimeout(timer);
  }, [activeTab, blogActivityStatus, blogPublishStatus, blogsSearch, fetchBlogs, loadedTabs.blogs]);

  useEffect(() => {
    if (activeTab !== "reports" || !loadedTabs.reports) {
      return;
    }

    void fetchReports(1);
  }, [activeTab, fetchReports, loadedTabs.reports, reportStatus]);

  if (loading || !isAuth || user?.role !== "admin") {
    return (
      <section className="space-y-4 py-6">
        <div className="premium-panel h-20 animate-pulse" />
        <div className="premium-panel h-64 animate-pulse" />
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1360px] space-y-6 py-6">
      <div className="premium-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Admin Control</p>
            <h1 className="premium-section-title mt-1 text-3xl font-semibold text-foreground">
              Platform Administration
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Moderate users, review reports, and track registration and publishing trends.
            </p>
          </div>
          <div className="inline-flex flex-wrap gap-2">
            {(["insights", "users", "blogs", "reports"] as AdminTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`panze-pill px-4 capitalize ${activeTab === tab ? "panze-pill-active" : ""}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === "insights" && (
        <div className="space-y-4">
          <div className="premium-panel p-5">
            <InsightFilters
              value={insightFilter}
              onChange={setInsightFilter}
              onApply={() => void fetchInsights()}
              applyLabel={insightsLoading ? "Loading..." : "Apply"}
              disabled={insightsLoading}
              defaultGranularity="month"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="premium-kpi p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Users</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {compact(Number(userInsights?.totals?.users ?? 0))}
              </p>
            </div>
            <div className="premium-kpi p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Weekly Signups</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {compact(Number(userInsights?.periods?.weekly ?? 0))}
              </p>
            </div>
            <div className="premium-kpi p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Blogs</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {compact(Number(blogInsights?.totals?.blogs ?? 0))}
              </p>
            </div>
            <div className="premium-kpi p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Open Reports</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {compact(Number(blogInsights?.totals?.openReports ?? 0))}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="premium-panel w-full p-5">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserRound className="size-4 text-ft-sky" />
                User Registrations
              </div>
              <InsightsLineChart
                title="Registrations"
                data={userRegistrations}
                color="#2563eb"
                chartType="bar"
                heightClassName="h-80"
              />
            </div>

            <div className="premium-panel w-full p-5">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <BarChart3 className="size-4 text-ft-accent" />
                Blogs Created
              </div>
              <InsightsLineChart
                title="Blog Adds"
                data={blogAdds}
                color="#ff8b37"
                chartType="bar"
                heightClassName="h-80"
              />
            </div>

            <div className="premium-panel w-full p-5">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <ChartNoAxesCombined className="size-4 text-emerald-600" />
                Blog Views
              </div>
              <InsightsLineChart
                title="Blog Views"
                data={blogViews}
                color="#059669"
                chartType="line"
                heightClassName="h-80"
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="premium-panel p-4">
            <Input
              value={usersSearch}
              onChange={(event) => setUsersSearch(event.target.value)}
              className="premium-input"
              placeholder="Search users by name or email"
            />
          </div>

          <div className="space-y-3">
            {usersLoading && usersPage.items.length === 0 ? (
              <div className="premium-panel h-56 animate-pulse" />
            ) : (
              usersPage.items.map((entry) => {
                const userBlogsState = userBlogsByUserId[entry._id] ?? createEmptyUserBlogState();
                const expanded = expandedUserId === entry._id;
                return (
                  <div key={entry._id} className="premium-panel p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-base font-semibold text-foreground">{entry.name}</p>
                        <p className="text-sm text-muted-foreground">{entry.email}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Joined {toDateLabel(entry.createdAt)} | Visits {compact(Number(entry.profileVisits ?? 0))}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                          {entry.role === "admin" ? "Admin" : "User"}
                        </span>
                        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                          {entry.isBanned ? "Banned" : entry.isActive ? "Active" : "Inactive"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => void toggleUserBan(entry)}
                        >
                          {entry.isBanned ? "Unban" : "Ban"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => void toggleUserActive(entry)}
                        >
                          {entry.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => toggleExpandUser(entry._id)}
                        >
                          {expanded ? "Hide Blogs" : "View Blogs"}
                        </Button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="mt-4 space-y-2 rounded-xl border border-border bg-card p-3">
                        {userBlogsState.loading && userBlogsState.items.length === 0 ? (
                          <div className="h-24 animate-pulse rounded-lg bg-muted" />
                        ) : userBlogsState.items.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No blogs found for this user.</p>
                        ) : (
                          userBlogsState.items.map((blog) => {
                            const publishStatus = blog.publishStatus ?? blog.publish_status ?? "published";
                            const active = blog.isActive ?? blog.is_active ?? true;
                            return (
                              <div
                                key={String(blog.id)}
                                className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div>
                                  <p className="font-medium text-foreground">{blog.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {publishStatus} | {active ? "active" : "inactive"} | likes{" "}
                                    {compact(Number(blog.likesCount ?? blog.likes_count ?? 0))} | views{" "}
                                    {compact(Number(blog.viewsCount ?? blog.views_count ?? 0))}
                                  </p>
                                </div>
                                <Link
                                  href={`/blog/${blog.id}`}
                                  className="inline-flex items-center gap-1 text-sm text-ft-accent"
                                >
                                  Open
                                  <ExternalLink className="size-3.5" />
                                </Link>
                              </div>
                            );
                          })
                        )}

                        {userBlogsState.hasMore && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            disabled={userBlogsState.loading}
                            onClick={() =>
                              void fetchUserBlogs(entry._id, userBlogsState.page + 1, true)
                            }
                          >
                            {userBlogsState.loading ? "Loading..." : "Load More Blogs"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total users: {compact(usersPage.total)}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={usersPage.page <= 1 || usersLoading}
                onClick={() => void fetchUsers(usersPage.page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {usersPage.page}</span>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={!usersPage.hasMore || usersLoading}
                onClick={() => void fetchUsers(usersPage.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "blogs" && (
        <div className="space-y-4">
          <div className="premium-panel grid gap-3 p-4 lg:grid-cols-[1fr_auto_auto]">
            <Input
              value={blogsSearch}
              onChange={(event) => setBlogsSearch(event.target.value)}
              className="premium-input"
              placeholder="Search blogs by title or description"
            />
            <select
              className="premium-input h-10"
              value={blogPublishStatus}
              onChange={(event) => setBlogPublishStatus(event.target.value)}
            >
              <option value="">All publish states</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
            <select
              className="premium-input h-10"
              value={blogActivityStatus}
              onChange={(event) => setBlogActivityStatus(event.target.value)}
            >
              <option value="">All activity states</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="space-y-3">
            {blogsLoading && blogsPage.items.length === 0 ? (
              <div className="premium-panel h-56 animate-pulse" />
            ) : (
              blogsPage.items.map((blog) => {
                const publishStatus = blog.publishStatus ?? blog.publish_status ?? "published";
                const isActive = blog.isActive ?? blog.is_active ?? true;
                return (
                  <div key={String(blog.id)} className="premium-panel p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-base font-semibold text-foreground">{blog.title}</p>
                        <p className="text-sm text-muted-foreground">
                          Author {blog.author} | {blog.category || "General"} | {toDateLabel(blog.createAt ?? blog.created_at)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          likes {compact(Number(blog.likesCount ?? blog.likes_count ?? 0))} | views{" "}
                          {compact(Number(blog.viewsCount ?? blog.views_count ?? 0))}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                          {publishStatus}
                        </span>
                        <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                          {isActive ? "active" : "inactive"}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            void moderateBlog(blog.id, {
                              isActive: !isActive,
                            })
                          }
                        >
                          {isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() =>
                            void moderateBlog(blog.id, {
                              publishStatus: publishStatus === "published" ? "draft" : "published",
                            })
                          }
                        >
                          {publishStatus === "published" ? "Move to Draft" : "Publish"}
                        </Button>
                        <Link
                          href={`/blog/${blog.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground"
                        >
                          Open
                          <ExternalLink className="size-3.5" />
                        </Link>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-full"
                          onClick={() => void deleteBlogAsAdmin(blog.id, blog.title)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total blogs: {compact(blogsPage.total)}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={blogsPage.page <= 1 || blogsLoading}
                onClick={() => void fetchBlogs(blogsPage.page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {blogsPage.page}</span>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={!blogsPage.hasMore || blogsLoading}
                onClick={() => void fetchBlogs(blogsPage.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="premium-panel p-4">
            <div className="flex items-center gap-3">
              <Flag className="size-4 text-rose-500" />
              <select
                className="premium-input h-10 max-w-xs"
                value={reportStatus}
                onChange={(event) => setReportStatus(event.target.value)}
              >
                <option value="">All report states</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {reportsLoading && reportsPage.items.length === 0 ? (
              <div className="premium-panel h-56 animate-pulse" />
            ) : (
              reportsPage.items.map((report) => (
                <div key={Number(report.id)} className="premium-panel p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        {report.blogTitle || `Blog ${report.blogId}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Reporter {report.reportedBy} | Blog Author {report.blogAuthor || "unknown"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reason {report.reason} | Created {toDateLabel(report.createdAt)}
                      </p>
                      {report.details && (
                        <p className="mt-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                          {report.details}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                        {report.blogPublishStatus || "published"}
                      </span>
                      <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground">
                        {report.blogIsActive ? "active" : "inactive"}
                      </span>
                      <select
                        className="premium-input h-9 min-w-32"
                        value={report.status}
                        onChange={(event) =>
                          void updateReportStatus(report.id, event.target.value as ReportStatus)
                        }
                      >
                        <option value="open">Open</option>
                        <option value="resolved">Resolved</option>
                        <option value="dismissed">Dismissed</option>
                      </select>
                      <Link
                        href={`/blog/${report.blogId}`}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground"
                      >
                        Open Blog
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total reports: {compact(reportsPage.total)}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={reportsPage.page <= 1 || reportsLoading}
                onClick={() => void fetchReports(reportsPage.page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {reportsPage.page}</span>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={!reportsPage.hasMore || reportsLoading}
                onClick={() => void fetchReports(reportsPage.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="premium-panel-soft flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Shield className="size-4 text-ft-accent" />
        Admin actions apply immediately and use paginated endpoints to keep rendering and payload size efficient.
      </div>
    </section>
  );
};

export default AdminDashboardClient;
