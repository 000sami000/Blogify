"use client";

import BlogDetailSkeleton from "@/components/skeletons/BlogDetailSkeleton";
import { CommentListSkeleton } from "@/components/skeletons/CommentSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  author_service,
  Blog,
  blog_service,
  comments_service,
  useAppData,
  User,
} from "@/context/AppContext";
import { getAuthToken, getSecureCookieFlag } from "@/lib/auth-token";
import { getApiErrorMessage } from "@/lib/api-error";
import { confirmBlogDelete } from "@/lib/confirm-delete";
import { formatCompactCount } from "@/lib/format-count";
import {
  generateVisitorId,
  isValidVisitorId,
  VISITOR_ID_COOKIE,
} from "@/lib/visitor-id";
import BlockReader from "@/features/editor/BlockReader";
import { contentToEditorData, outputToPayload } from "@/features/editor/utils";
import axios from "axios";
import Cookies from "js-cookie";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Clock3,
  Edit,
  Eye,
  Flag,
  Heart,
  MessageSquare,
  Send,
  Share2,
  Trash2,
  Trash2Icon,
  User2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

interface Comment {
  id: string;
  user_id: string;
  comment: string;
  createdAt: string;
  updatedAt: string;
  username: string;
  blog_id: string;
  pending?: boolean;
}

interface PaginatedCommentsResponse {
  items: Comment[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

const COMMENTS_PAGE_SIZE = 10;

const normalizeCommentsResponse = (
  data: unknown,
  fallbackPage: number
): PaginatedCommentsResponse => {
  if (Array.isArray(data)) {
    const items = data as Comment[];
    return {
      items,
      page: fallbackPage,
      limit: COMMENTS_PAGE_SIZE,
      total: items.length,
      hasMore: items.length === COMMENTS_PAGE_SIZE,
    };
  }

  if (data && typeof data === "object") {
    const payload = data as Partial<PaginatedCommentsResponse> & {
      items?: unknown;
    };

    const items = Array.isArray(payload.items) ? (payload.items as Comment[]) : [];
    const limit =
      typeof payload.limit === "number" && payload.limit > 0
        ? payload.limit
        : COMMENTS_PAGE_SIZE;
    const page =
      typeof payload.page === "number" && payload.page > 0
        ? payload.page
        : fallbackPage;

    const inferredTotal = (page - 1) * limit + items.length;

    return {
      items,
      page,
      limit,
      total:
        typeof payload.total === "number" && payload.total >= 0
          ? payload.total
          : inferredTotal,
      hasMore:
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : items.length === limit,
    };
  }

  return {
    items: [],
    page: fallbackPage,
    limit: COMMENTS_PAGE_SIZE,
    total: 0,
    hasMore: false,
  };
};

interface BlogDetailClientProps {
  blogId: string;
  initialBlog?: Blog | null;
  initialAuthor?: User | null;
  initialRelated?: Blog[];
}

const BlogDetailClient = ({
  blogId,
  initialBlog = null,
  initialAuthor = null,
  initialRelated = [],
}: BlogDetailClientProps) => {
  const {
    isAuth,
    user,
    fetchBlogs,
    savedBlogs,
    getSavedBlogs,
    clearApiError,
    setApiErrorMessage,
  } = useAppData();
  const router = useRouter();
  const id = blogId;

  const [blog, setBlog] = useState<Blog | null>(initialBlog);
  const [author, setAuthor] = useState<User | null>(initialAuthor);
  const [relatedBlogs, setRelatedBlogs] = useState<Blog[]>(initialRelated);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsPage, setCommentsPage] = useState(0);
  const [totalComments, setTotalComments] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  const [comment, setComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [updatingComment, setUpdatingComment] = useState(false);
  const [likedByMe, setLikedByMe] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const commentsRequestInFlightRef = useRef(false);
  const commentsRef = useRef<Comment[]>([]);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    if (!editingCommentId) {
      return;
    }

    const editingCommentStillVisible = comments.some(
      (entry) => entry.id === editingCommentId
    );

    if (!editingCommentStillVisible) {
      setEditingCommentId(null);
      setEditingCommentText("");
    }
  }, [comments, editingCommentId]);

  const commentCountLabel = useMemo(() => {
    const count = totalComments || comments.length;
    if (count === 1) {
      return "1 comment";
    }
    return `${count} comments`;
  }, [totalComments, comments.length]);

  const blogCreatedAt = blog?.createAt ?? blog?.created_at;
  const likesCount = Number(blog?.likesCount ?? blog?.likes_count ?? 0);
  const viewsCount = Number(blog?.viewsCount ?? blog?.views_count ?? 0);
  const blogDocument = useMemo(
    () => contentToEditorData(blog?.blogcontent ?? ""),
    [blog?.blogcontent]
  );

  const processedContent = useMemo(() => {
    const payload = outputToPayload(blogDocument);
    return {
      plainText: payload.plainText,
      toc: payload.toc.slice(0, 16),
    };
  }, [blogDocument]);

  const readingTimeMinutes = Math.max(
    1,
    Math.ceil(processedContent.plainText.split(/\s+/).filter(Boolean).length / 220)
  );
  const readerKey = useMemo(() => {
    const rawContent = blog?.blogcontent;
    if (typeof rawContent === "string") {
      return `${id}:str:${rawContent.length}`;
    }

    if (
      rawContent &&
      typeof rawContent === "object" &&
      Array.isArray((rawContent as { blocks?: unknown[] }).blocks)
    ) {
      return `${id}:blocks:${(rawContent as { blocks: unknown[] }).blocks.length}`;
    }

    return `${id}:empty`;
  }, [blog?.blogcontent, id]);

  const fetchCommentsPage = useCallback(
    async (targetPage: number, mode: "append" | "replace" = "append") => {
      if (!id) {
        return;
      }

      if (mode === "append" && commentsRequestInFlightRef.current) {
        return;
      }

      commentsRequestInFlightRef.current = true;
      setCommentsLoading(true);

      try {
        const { data } = await axios.get(`${comments_service}/api/v1/comment/${id}`, {
          params: {
            page: targetPage,
            limit: COMMENTS_PAGE_SIZE,
          },
        });

        const parsed = normalizeCommentsResponse(data, targetPage);
        const current = commentsRef.current;
        const dedupeIds = new Set(current.map((item) => item.id));
        const nextItems =
          mode === "replace"
            ? parsed.items
            : [...current, ...parsed.items.filter((item) => !dedupeIds.has(item.id))];

        const appendedCount =
          mode === "append" ? Math.max(nextItems.length - current.length, 0) : nextItems.length;

        commentsRef.current = nextItems;
        setComments(nextItems);

        setCommentsPage(parsed.page);
        setTotalComments(parsed.total);
        setHasMoreComments(parsed.hasMore && (mode !== "append" || appendedCount > 0));
        setCommentsError(null);
        clearApiError();
        setApiErrorMessage(null);
      } catch (error) {
        const message = getApiErrorMessage(error, "Failed to fetch comments");
        setCommentsError(message);
        setHasMoreComments(false);

        if (targetPage === 1) {
          setComments([]);
          setTotalComments(0);
          setApiErrorMessage(message);
          toast.error(message);
        }
      } finally {
        setCommentsLoading(false);
        commentsRequestInFlightRef.current = false;
      }
    },
    [id, clearApiError, setApiErrorMessage]
  );

  const refreshComments = useCallback(async () => {
    setComments([]);
    setCommentsPage(0);
    setTotalComments(0);
    setHasMoreComments(true);
    setCommentsError(null);
    await fetchCommentsPage(1, "replace");
  }, [fetchCommentsPage]);

  const loadNextCommentsPage = useCallback(async () => {
    if (
      !hasMoreComments ||
      commentsLoading ||
      commentsPage < 1 ||
      commentsError ||
      commentsRequestInFlightRef.current
    ) {
      return;
    }

    await fetchCommentsPage(commentsPage + 1, "append");
  }, [
    hasMoreComments,
    commentsLoading,
    commentsPage,
    commentsError,
    fetchCommentsPage,
  ]);

  useEffect(() => {
    if (!id) {
      return;
    }

    void refreshComments();
  }, [id, refreshComments]);

  useEffect(() => {
    const anchor = loadMoreRef.current;

    if (!anchor) {
      return;
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (!hasMoreComments || commentsLoading || commentsPage < 1 || commentsError) {
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (entry.isIntersecting) {
          void loadNextCommentsPage();
        }
      },
      { rootMargin: "260px 0px 260px 0px", threshold: 0.01 }
    );

    observerRef.current.observe(anchor);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [hasMoreComments, commentsLoading, commentsPage, commentsError, loadNextCommentsPage]);

  useEffect(() => {
    if (
      !hasMoreComments ||
      commentsLoading ||
      commentsPage < 1 ||
      commentsError
    ) {
      return;
    }

    const anchor = loadMoreRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const nearViewport = rect.top <= window.innerHeight + 260;

    if (nearViewport) {
      void loadNextCommentsPage();
    }
  }, [
    comments.length,
    hasMoreComments,
    commentsLoading,
    commentsPage,
    commentsError,
    loadNextCommentsPage,
  ]);

  async function addComment() {
    const trimmedComment = comment.trim();

    if (!trimmedComment) {
      toast.error("Comment is required");
      return;
    }

    try {
      setLoading(true);
      const token = getAuthToken();
      if (!token) {
        const message = "Please login first";
        setPageError(message);
        setApiErrorMessage(message);
        toast.error(message);
        return;
      }
      const { data } = await axios.post(
        `${comments_service}/api/v1/comment/${id}`,
        { comment: trimmedComment },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      toast.success(data.message);
      setComment("");

      if (data?.queued && data?.comment) {
        setComments((previous) => [data.comment as Comment, ...previous]);
        setTotalComments((previous) => previous + 1);
      } else {
        await refreshComments();
      }

      clearApiError();
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Problem while adding comment");
      setCommentsError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const fetchSingleBlog = useCallback(async () => {
    if (!id) {
      return;
    }
    try {
      setLoading(true);
      const token = getAuthToken();
      const existingVisitorId = Cookies.get(VISITOR_ID_COOKIE);
      const visitorId = isValidVisitorId(existingVisitorId)
        ? existingVisitorId
        : generateVisitorId();

      if (!isValidVisitorId(existingVisitorId)) {
        Cookies.set(VISITOR_ID_COOKIE, visitorId, {
          expires: 365,
          sameSite: "lax",
          secure: getSecureCookieFlag(),
          path: "/",
        });
      }

      const headers: Record<string, string> = {
        "x-visitor-id": visitorId,
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const { data } = await axios.get(`${blog_service}/api/v1/blog/${id}`, {
        headers,
      });
      setBlog(data.blog);
      setAuthor(data.author);
      setPageError(null);
      clearApiError();
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to load blog");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [id, clearApiError, setApiErrorMessage]);

  const fetchRelatedBlogs = useCallback(async () => {
    if (!blog?.category) {
      return;
    }

    try {
      const { data } = await axios.get(`${blog_service}/api/v1/blog/all`, {
        params: {
          category: blog.category,
          page: 1,
          limit: 6,
        },
      });

      const items = Array.isArray(data?.items)
        ? (data.items as Blog[])
        : Array.isArray(data)
          ? (data as Blog[])
          : [];

      setRelatedBlogs(items.filter((item) => String(item.id) !== String(id)).slice(0, 3));
    } catch {
      // best-effort recommendation section
    }
  }, [blog?.category, id]);

  const fetchLikeStatus = useCallback(async () => {
    if (!id || !isAuth) {
      setLikedByMe(false);
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setLikedByMe(false);
      return;
    }

    try {
      const { data } = await axios.get(`${blog_service}/api/v1/blog/${id}/like/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setLikedByMe(Boolean(data?.liked));
      setBlog((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          likesCount: Number(data?.likesCount ?? prev.likesCount ?? prev.likes_count ?? 0),
          viewsCount: Number(data?.viewsCount ?? prev.viewsCount ?? prev.views_count ?? 0),
        };
      });
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to load like status");
      setApiErrorMessage(message);
    }
  }, [id, isAuth, setApiErrorMessage]);

  const toggleLike = async () => {
    if (!id) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      const message = "Please login first";
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
      return;
    }

    try {
      setLikeLoading(true);
      const { data } = await axios.post(
        `${blog_service}/api/v1/blog/${id}/like`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setLikedByMe(Boolean(data?.liked));
      setBlog((prev) => {
        if (!prev) {
          return prev;
        }
        return {
          ...prev,
          likesCount: Number(data?.likesCount ?? prev.likesCount ?? prev.likes_count ?? 0),
          viewsCount: Number(data?.viewsCount ?? prev.viewsCount ?? prev.views_count ?? 0),
        };
      });

      toast.success(data?.message || (data?.liked ? "Blog liked" : "Blog unliked"));
      clearApiError();
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to update like");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLikeLoading(false);
    }
  };

  const reportBlog = async () => {
    if (!id) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      const message = "Please login first";
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
      return;
    }

    const reason = prompt(
      "Reason for report (spam, abuse, copyright, misinformation, other):",
      "other"
    );

    if (!reason) {
      return;
    }

    const details = prompt("Optional details (why this should be reviewed):", "") || "";

    try {
      setReportLoading(true);
      const { data } = await axios.post(
        `${blog_service}/api/v1/blog/${id}/report`,
        { reason, details },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      toast.success(data?.message || "Report submitted");
    } catch (error) {
      const message = getApiErrorMessage(error, "Failed to submit report");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setReportLoading(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) {
      return;
    }

    try {
      setLoading(true);
      const token = getAuthToken();
      if (!token) {
        const message = "Please login first";
        setPageError(message);
        setApiErrorMessage(message);
        toast.error(message);
        return;
      }

      const { data } = await axios.delete(
        `${comments_service}/api/v1/comment/${commentId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      toast.success(data.message);
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditingCommentText("");
      }

      if (data?.queued) {
        setComments((previous) =>
          previous.filter((item) => item.id !== commentId)
        );
        setTotalComments((previous) => Math.max(0, previous - 1));
      } else {
        await refreshComments();
      }

      clearApiError();
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Problem while deleting comment");
      setCommentsError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const startEditingComment = (entry: Comment) => {
    setEditingCommentId(entry.id);
    setEditingCommentText(entry.comment);
  };

  const cancelEditingComment = () => {
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  const updateComment = async () => {
    if (!editingCommentId) {
      return;
    }

    const trimmedComment = editingCommentText.trim();

    if (!trimmedComment) {
      toast.error("Comment is required");
      return;
    }

    try {
      setUpdatingComment(true);
      const token = getAuthToken();
      if (!token) {
        const message = "Please login first";
        setPageError(message);
        setApiErrorMessage(message);
        toast.error(message);
        return;
      }

      const { data } = await axios.put(
        `${comments_service}/api/v1/comment/${editingCommentId}`,
        { comment: trimmedComment },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      toast.success(data.message || "Comment updated");
      if (data?.queued) {
        setComments((previous) =>
          previous.map((item) =>
            item.id === editingCommentId
              ? {
                  ...item,
                  comment: trimmedComment,
                  pending: true,
                  updatedAt: new Date().toISOString(),
                }
              : item
          )
        );
      } else {
        await refreshComments();
      }
      setEditingCommentId(null);
      setEditingCommentText("");
      clearApiError();
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Problem while updating comment");
      setCommentsError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setUpdatingComment(false);
    }
  };

  async function deletBlog() {
    if (!confirmBlogDelete(blog?.title)) {
      return;
    }

    try {
      setLoading(true);
      const token = getAuthToken();
      if (!token) {
        const message = "Please login first";
        setPageError(message);
        setApiErrorMessage(message);
        toast.error(message);
        return;
      }
      const { data } = await axios.delete(`${author_service}/api/v1/blog/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      toast.success(data.message);
      router.push("/blogs");
      setTimeout(() => {
        fetchBlogs();
      }, 1200);
      clearApiError();
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Problem while deleting blog");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (savedBlogs && savedBlogs.some((b) => b.blogid === String(id))) {
      setSaved(true);
    } else {
      setSaved(false);
    }
  }, [savedBlogs, id]);

  async function saveBlog() {
    const token = getAuthToken();
    if (!token) {
      const message = "Unauthorized. Please login first.";
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
      return;
    }
    try {
      setLoading(true);
      const { data } = await axios.post(
        `${blog_service}/api/v1/save/${id}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      toast.success(data.message);
      setSaved(!saved);
      getSavedBlogs();
      clearApiError();
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Problem while saving blog");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const shareBlog = async () => {
    if (!blog || typeof window === "undefined") {
      return;
    }

    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: blog.title,
          text: blog.description,
          url,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Blog link copied");
      }
    } catch (error) {
      const shareError = error as Error;
      if (shareError.name !== "AbortError") {
        toast.error("Unable to share this blog now");
      }
    }
  };

  useEffect(() => {
    if (initialBlog) {
      return;
    }
    fetchSingleBlog();
  }, [fetchSingleBlog, initialBlog]);

  useEffect(() => {
    void fetchRelatedBlogs();
  }, [fetchRelatedBlogs]);

  useEffect(() => {
    void fetchLikeStatus();
  }, [fetchLikeStatus]);

  if (!blog && !pageError) {
    return <BlogDetailSkeleton />;
  }

  return (
    <section className="mx-auto w-full max-w-[1360px] space-y-8 pb-14 pt-6">
      {pageError && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {pageError}
        </div>
      )}

      {blog && (
        <article className="premium-panel animate-fade-up overflow-hidden border-0 shadow-ft-soft">
          <div className="relative h-[320px] overflow-hidden sm:h-[420px] lg:h-[500px]">
            <img src={blog.image} alt={blog.title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#04070C]/80 via-[#04070C]/45 to-transparent" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,138,91,0.2),transparent_45%)]" />

            <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 lg:p-10">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-medium text-ft-muted">
                <span className="inline-flex items-center gap-1 rounded-full border border-ft-border bg-ft-card/80 px-3 py-1">
                  {blog.category || "General"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-ft-border bg-ft-card/80 px-3 py-1">
                  <CalendarDays className="size-3.5" />
                  {blogCreatedAt && !Number.isNaN(new Date(blogCreatedAt).getTime())
                    ? new Date(blogCreatedAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Recently published"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-ft-border bg-ft-card/80 px-3 py-1">
                  <Clock3 className="size-3.5" />
                  {readingTimeMinutes} min read
                </span>
              </div>

              <h1 className="max-w-4xl text-balance font-display text-3xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                {blog.title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200 sm:text-base">
                {blog.description}
              </p>

              <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-xs text-white backdrop-blur">
                {author?._id ? (
                  <Link href={`/profile/${author._id}`} className="inline-flex items-center gap-2 hover:opacity-85">
                    <img
                      src={author.image}
                      className="h-6 w-6 rounded-full object-cover ring-1 ring-white/30"
                      alt={author.name}
                    />
                    <span className="font-medium">{author.name}</span>
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <User2 className="size-3.5" />
                    Unknown author
                  </span>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/35 px-3 py-1.5 text-xs font-medium text-white">
                  <Heart className="size-3.5 text-[#FF8A5B]" />
                  {formatCompactCount(likesCount)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/35 px-3 py-1.5 text-xs font-medium text-white">
                  <Eye className="size-3.5 text-ft-sky" />
                  {formatCompactCount(viewsCount)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/35 px-3 py-1.5 text-xs font-medium text-white">
                  <MessageSquare className="size-3.5 text-ft-muted" />
                  {formatCompactCount(totalComments || comments.length)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/35 px-3 py-1.5 text-xs font-medium text-white">
                  <Send className="size-3.5 text-ft-accent" />
                  Share
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-8 border-t border-ft-border/90 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.75fr)_340px]">
            <div className="space-y-8">
              <div className="rounded-2xl border border-ft-border bg-ft-card p-5 shadow-sm sm:p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-ft-muted">Introduction</p>
                <p className="mt-3 text-base leading-7 text-ft-muted">{blog.description}</p>
              </div>

              <div className="rounded-2xl border border-ft-border bg-ft-card p-5 shadow-sm sm:p-8">
                <BlockReader key={readerKey} content={blogDocument} className="max-w-none" />
              </div>

              <section className="rounded-2xl border border-ft-border bg-ft-card p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-end justify-between gap-2">
                  <div>
                    <h3 className="font-display text-2xl text-ft-text">Discussion</h3>
                    <p className="text-sm text-ft-muted">{commentCountLabel}</p>
                  </div>
                </div>

                {isAuth && (
                  <div className="mb-6 rounded-2xl border border-ft-border bg-ft-card/60 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ft-accent/90 text-sm font-semibold text-ft-bg">
                        {(user?.name?.[0] || "U").toUpperCase()}
                      </div>
                      <div className="w-full space-y-2">
                        <Input
                          id="comment"
                          placeholder="Add a public comment..."
                          className="h-11 rounded-xl border-ft-border bg-ft-panel text-ft-text placeholder:text-ft-muted"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <div className="flex justify-end">
                          <Button
                            onClick={addComment}
                            disabled={loading}
                            className="h-9 rounded-full bg-ft-accent px-5 text-ft-bg hover:brightness-95"
                          >
                            {loading ? "Posting..." : "Comment"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {comments.length > 0 ? (
                  <div className="space-y-4">
                    {comments.map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-xl border border-ft-border bg-ft-card/50 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground dark:bg-[#1B2432] dark:text-ft-text">
                            {(entry.username?.[0] || "U").toUpperCase()}
                          </div>

                          <div className="w-full">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="font-semibold text-ft-text">{entry.username}</p>
                              <span className="text-xs text-ft-muted">
                                {new Date(entry.createdAt).toLocaleDateString()}{" "}
                                {new Date(entry.createdAt).toLocaleTimeString()}
                              </span>
                            </div>

                            {editingCommentId === entry.id ? (
                              <div className="mt-3 space-y-2 rounded-lg border border-ft-border bg-ft-panel p-3">
                                <Input
                                  value={editingCommentText}
                                  onChange={(e) => setEditingCommentText(e.target.value)}
                                  className="h-10 rounded-lg border-ft-border bg-ft-card text-ft-text"
                                  placeholder="Update your comment"
                                  disabled={updatingComment}
                                />
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 rounded-full border border-ft-border bg-ft-card text-ft-text"
                                    onClick={cancelEditingComment}
                                    disabled={updatingComment}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-8 rounded-full bg-ft-accent px-4 text-ft-bg hover:brightness-95"
                                    onClick={updateComment}
                                    disabled={updatingComment}
                                  >
                                    {updatingComment ? "Saving..." : "Save"}
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="mt-2 whitespace-pre-line text-sm text-ft-muted">
                                {entry.comment}
                              </p>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-xs text-ft-muted">
                                <User2 className="size-3.5" /> Community reply
                              </span>

                              {entry.user_id === user?._id && (
                                <>
                                  <Button
                                    onClick={() => startEditingComment(entry)}
                                    variant="ghost"
                                    size="sm"
                                    disabled={loading || updatingComment}
                                    className="h-7 rounded-full border border-ft-border bg-ft-panel px-3 text-ft-text"
                                  >
                                    <Edit className="size-3.5" /> Edit
                                  </Button>
                                  <Button
                                    onClick={() => deleteComment(entry.id)}
                                    variant="ghost"
                                    size="sm"
                                    disabled={loading || updatingComment}
                                    className="h-7 rounded-full border border-red-500/35 bg-red-500/10 px-3 text-red-300"
                                  >
                                    <Trash2 className="size-3.5" /> Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : commentsLoading ? (
                  <CommentListSkeleton count={3} />
                ) : (
                  <p className="rounded-xl border border-ft-border bg-ft-card/40 px-4 py-3 text-sm text-ft-muted">
                    No comments yet.
                  </p>
                )}

                {commentsLoading && comments.length > 0 && !commentsError && (
                  <CommentListSkeleton count={2} className="mt-4" />
                )}

                {commentsError && (
                  <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                    <p>{commentsError}</p>
                    <Button
                      variant="outline"
                      className="mt-2 rounded-full border-red-400/40 bg-red-500/10 text-red-200"
                      onClick={() => {
                        void refreshComments();
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {hasMoreComments && !commentsError && comments.length > 0 && (
                  <div
                    ref={loadMoreRef}
                    className="mt-5 flex min-h-10 items-center justify-center py-2"
                  >
                    <p className="text-xs text-ft-muted">
                      {commentsLoading ? "Loading next comments..." : "Scroll to load more"}
                    </p>
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
              <div className="rounded-2xl border border-ft-border bg-ft-card p-5 shadow-sm">
                {author?._id ? (
                  <Link
                    className="mb-5 inline-flex items-center gap-3"
                    href={`/profile/${author._id}`}
                  >
                    <img
                      src={author.image}
                      className="h-11 w-11 rounded-full object-cover ring-2 ring-ft-border"
                      alt={author.name}
                    />
                    <span className="text-sm font-semibold text-ft-text">{author.name}</span>
                  </Link>
                ) : (
                  <span className="mb-5 inline-flex items-center gap-2 text-sm text-ft-muted">
                    <User2 className="size-4" />
                    Unknown author
                  </span>
                )}

                <div className="space-y-4">
                  <div className="rounded-xl border border-ft-border bg-ft-panel p-4">
                    <p className="text-sm font-semibold text-ft-text">Actions</p>
                    <div className="mt-3 grid gap-2">
                      <Button
                        variant="ghost"
                        className={`h-10 w-full justify-start rounded-full border ${
                          likedByMe
                            ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-[#FF8A5B]/60 dark:bg-[#FF8A5B]/15 dark:text-[#FFB08F]"
                            : "border-ft-border bg-ft-card text-ft-text"
                        }`}
                        disabled={likeLoading}
                        onClick={toggleLike}
                      >
                        <Heart className={`size-4 ${likedByMe ? "fill-current" : ""}`} />
                        {likedByMe ? "Liked" : "Like"}
                      </Button>

                      <Button
                        variant="ghost"
                        className="h-10 w-full justify-start rounded-full border border-ft-border bg-ft-card text-ft-text"
                        disabled={loading}
                        onClick={saveBlog}
                      >
                        {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
                        {saved ? "Saved" : "Save"}
                      </Button>

                      <Button
                        variant="ghost"
                        className="h-10 w-full justify-start rounded-full border border-ft-border bg-ft-card text-ft-text"
                        onClick={shareBlog}
                      >
                        <Share2 className="size-4" />
                        Share
                      </Button>

                      {blog.author === user?._id && (
                        <Button
                          variant="ghost"
                          className="h-10 w-full justify-start rounded-full border border-ft-border bg-ft-card text-ft-text"
                          onClick={() => router.push(`/blog/edit/${id}`)}
                        >
                          <Edit className="size-4" />
                          Edit
                        </Button>
                      )}

                      {blog.author !== user?._id && (
                        <Button
                          variant="ghost"
                          className="h-10 w-full justify-start rounded-full border border-ft-border bg-ft-card text-ft-text"
                          disabled={reportLoading}
                          onClick={reportBlog}
                        >
                          <Flag className="size-4" />
                          Report
                        </Button>
                      )}

                      {blog.author === user?._id && (
                        <Button
                          variant="destructive"
                          className="h-10 w-full justify-start rounded-full"
                          onClick={deletBlog}
                          disabled={loading}
                        >
                          <Trash2Icon className="size-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-ft-border bg-ft-panel p-4">
                    <p className="text-sm font-semibold text-ft-text">Table of Contents</p>
                    <ul className="mt-3 space-y-2 text-sm text-ft-muted">
                      {processedContent.toc.length === 0 && <li>Article sections are loading.</li>}
                      {processedContent.toc.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              const target = document.getElementById(item.id);
                              if (!target) {
                                return;
                              }
                              target.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                            }}
                            className={`w-full truncate border-l border-ft-border text-left transition hover:text-ft-text ${
                              item.level === 3 ? "pl-6" : "pl-3"
                            }`}
                          >
                            - {item.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </article>
      )}

      {relatedBlogs.length > 0 && (
        <section className="premium-panel rounded-[24px] border-0 px-5 py-6 sm:px-7">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-display text-2xl text-ft-text">Similar News</h3>
            <Link
              href="/blogs"
              className="inline-flex items-center gap-1 rounded-full border border-ft-border bg-ft-card px-3 py-1 text-sm text-ft-muted transition hover:text-ft-text"
            >
              View all <ArrowUpRight className="size-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {relatedBlogs.map((item) => {
              const relatedLikes = Number(item.likesCount ?? item.likes_count ?? 0);
              const relatedViews = Number(item.viewsCount ?? item.views_count ?? 0);
              const relatedDate = item.createAt ?? item.created_at;
              const relatedDateLabel =
                relatedDate && !Number.isNaN(new Date(relatedDate).getTime())
                  ? new Date(relatedDate).toLocaleDateString()
                  : "Recent";

              return (
                <Link
                  key={String(item.id)}
                  href={`/blog/${item.id}`}
                  className="group overflow-hidden rounded-2xl border border-ft-border bg-ft-panel transition hover:-translate-y-1 dark:bg-[#0F141D]"
                >
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <span className="absolute bottom-3 left-3 rounded-full border border-ft-border bg-ft-card/90 px-2.5 py-1 text-[11px] text-ft-muted">
                      {item.category || "General"}
                    </span>
                  </div>
                  <div className="space-y-3 p-4">
                    <p className="line-clamp-2 text-base font-semibold text-ft-text">
                      {item.title}
                    </p>
                    <p className="line-clamp-2 text-sm text-ft-muted">{item.description}</p>
                    <div className="flex items-center justify-between text-xs text-ft-muted">
                      <span>{relatedDateLabel}</span>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Heart className="size-3.5" />
                          {formatCompactCount(relatedLikes)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5" />
                          {formatCompactCount(relatedViews)}
                        </span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm text-ft-accent">
                      Read more <ArrowUpRight className="size-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
};

export default BlogDetailClient;
