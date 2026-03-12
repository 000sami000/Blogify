"use client";

import { useAppData, notification_service } from "@/context/AppContext";
import { getApiErrorMessage } from "@/lib/api-error";
import { getAuthToken } from "@/lib/auth-token";
import axios from "axios";
import { Bell, LoaderCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { Button } from "./ui/button";

interface NotificationItem {
  id: string;
  recipientUserId: string;
  actorUserId: string;
  actorName?: string;
  type: "blog_like" | "blog_comment" | "profile_star";
  blogId?: number;
  metadata?: Record<string, unknown>;
  message: string;
  isRead: boolean;
  createdAt?: string;
}

const getNotificationHref = (item: NotificationItem) => {
  if (item.type === "profile_star" && item.actorUserId) {
    return `/profile/${item.actorUserId}`;
  }

  if (item.blogId) {
    return `/blog/${item.blogId}`;
  }

  return "/blogs";
};

const toDateLabel = (value?: string) => {
  if (!value) {
    return "Now";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Now";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const NotificationBell = () => {
  const { isAuth } = useAppData();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [countLoading, setCountLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasUnread = unreadCount > 0;

  const authHeaders = useMemo(() => {
    if (!isAuth) {
      return null;
    }
    const token = getAuthToken();
    if (!token) {
      return null;
    }
    return {
      Authorization: `Bearer ${token}`,
    };
  }, [isAuth]);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuth || !authHeaders || !notification_service) {
      setUnreadCount(0);
      return;
    }

    try {
      setCountLoading(true);
      const { data } = await axios.get<{ unreadCount?: number }>(
        `${notification_service}/api/v1/notification/unread-count`,
        {
          headers: authHeaders,
        }
      );
      setUnreadCount(Number(data?.unreadCount ?? 0));
    } catch (error) {
      setUnreadCount(0);
      console.error("Failed to fetch notification count:", error);
    } finally {
      setCountLoading(false);
    }
  }, [authHeaders, isAuth]);

  const fetchNotifications = useCallback(async (pageNumber: number) => {
    if (!isAuth || !authHeaders || !notification_service) {
      setItems([]);
      setPage(1);
      setHasMore(false);
      return;
    }

    try {
      if (pageNumber === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      const { data } = await axios.get<{
        items?: NotificationItem[];
        hasMore?: boolean;
        page?: number;
      }>(`${notification_service}/api/v1/notification/my`, {
        headers: authHeaders,
        params: {
          page: pageNumber,
          limit: 12,
        },
      });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems((previous) =>
        pageNumber === 1 ? nextItems : [...previous, ...nextItems]
      );
      setPage(pageNumber);
      setHasMore(Boolean(data?.hasMore));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to fetch notifications"));
    } finally {
      if (pageNumber === 1) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  }, [authHeaders, isAuth]);

  const markOneAsRead = useCallback(
    async (itemId: string) => {
      if (!isAuth || !authHeaders || !notification_service) {
        return;
      }

      try {
        await axios.patch(
          `${notification_service}/api/v1/notification/${itemId}/read`,
          {},
          {
            headers: authHeaders,
          }
        );
        setItems((previous) =>
          previous.map((item) =>
            item.id === itemId ? { ...item, isRead: true } : item
          )
        );
        setUnreadCount((previous) => Math.max(0, previous - 1));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    },
    [authHeaders, isAuth]
  );

  const markAllAsRead = useCallback(async () => {
    if (!isAuth || !authHeaders || !notification_service) {
      return;
    }

    try {
      await axios.patch(
        `${notification_service}/api/v1/notification/read-all`,
        {},
        {
          headers: authHeaders,
        }
      );
      setItems((previous) =>
        previous.map((item) => ({
          ...item,
          isRead: true,
        }))
      );
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to mark all as read"));
    }
  }, [authHeaders, isAuth]);

  const deleteNotification = useCallback(
    async (itemId: string) => {
      if (!isAuth || !authHeaders || !notification_service) {
        return;
      }

      const current = items.find((item) => item.id === itemId);

      try {
        await axios.delete(
          `${notification_service}/api/v1/notification/${itemId}`,
          {
            headers: authHeaders,
          }
        );
        setItems((previous) => previous.filter((item) => item.id !== itemId));
        if (current && !current.isRead) {
          setUnreadCount((previous) => Math.max(0, previous - 1));
        }
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Failed to delete notification"));
      }
    },
    [authHeaders, isAuth, items]
  );

  const deleteAllNotifications = useCallback(async () => {
    if (!isAuth || !authHeaders || !notification_service) {
      return;
    }

    try {
      await axios.delete(
        `${notification_service}/api/v1/notification/delete-all`,
        {
          headers: authHeaders,
        }
      );
      setItems([]);
      setPage(1);
      setHasMore(false);
      setUnreadCount(0);
      toast.success("All notifications deleted");
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Failed to delete notifications")
      );
    }
  }, [authHeaders, isAuth]);

  useEffect(() => {
    if (!isAuth) {
      return;
    }

    void fetchUnreadCount();

    const timer = setInterval(() => {
      void fetchUnreadCount();
    }, 20000);

    return () => clearInterval(timer);
  }, [fetchUnreadCount, isAuth]);

  useEffect(() => {
    if (!open || !isAuth) {
      return;
    }

    void fetchNotifications(1);
  }, [fetchNotifications, isAuth, open]);

  useEffect(() => {
    if (!open || !hasMore || loading || loadingMore) {
      return;
    }

    const container = listRef.current;
    const sentinel = sentinelRef.current;

    if (!container || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry || !entry.isIntersecting) {
          return;
        }
        if (loading || loadingMore || !hasMore) {
          return;
        }
        void fetchNotifications(page + 1);
      },
      {
        root: container,
        rootMargin: "120px",
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [fetchNotifications, hasMore, loading, loadingMore, open, page]);

  if (!isAuth) {
    return null;
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        onClick={() => setOpen((previous) => !previous)}
        className="relative size-10 rounded-full border border-ft-border bg-ft-panel text-ft-text"
      >
        <Bell className="size-4" />
        {hasUnread && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-12 z-[80] w-[min(92vw,380px)] rounded-2xl border border-ft-border bg-ft-card p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-ft-text">Notifications</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-ft-accent transition hover:opacity-80 disabled:opacity-50"
                onClick={() => void markAllAsRead()}
                disabled={unreadCount <= 0 || countLoading}
              >
                Mark all read
              </button>
              <button
                type="button"
                className="text-xs text-rose-400 transition hover:opacity-80 disabled:opacity-50"
                onClick={() => void deleteAllNotifications()}
                disabled={items.length === 0 || loading}
              >
                Clear all
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex h-24 items-center justify-center text-sm text-ft-muted">
              <LoaderCircle className="mr-2 size-4 animate-spin" />
              Loading notifications...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-ft-border bg-ft-panel p-3 text-sm text-ft-muted">
              No notifications yet.
            </div>
          ) : (
            <div
              ref={listRef}
              className="max-h-[420px] space-y-2 overflow-y-auto pr-1"
            >
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 transition ${
                    item.isRead
                      ? "border-ft-border bg-ft-panel text-ft-muted"
                      : "border-ft-accent/30 bg-ft-accent/10 text-ft-text"
                  }`}
                >
                  <Link
                    href={getNotificationHref(item)}
                    onClick={() => {
                      setOpen(false);
                      if (!item.isRead) {
                        void markOneAsRead(item.id);
                      }
                    }}
                    className="flex-1"
                  >
                    <p className="text-sm">{item.message}</p>
                    <p className="mt-1 text-[11px] text-ft-muted">
                      {toDateLabel(item.createdAt)}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void deleteNotification(item.id);
                    }}
                    className="mt-0.5 inline-flex size-7 items-center justify-center rounded-full border border-transparent text-ft-muted transition hover:border-rose-400/40 hover:text-rose-400"
                    aria-label="Delete notification"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <div ref={sentinelRef} />
              {loadingMore && (
                <div className="flex items-center justify-center py-3 text-xs text-ft-muted">
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  Loading more...
                </div>
              )}
              {!hasMore && items.length > 0 && (
                <div className="py-2 text-center text-[11px] text-ft-muted">
                  You’re all caught up.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
