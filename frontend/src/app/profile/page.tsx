"use client";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppData, user_service } from "@/context/AppContext";
import { getApiErrorMessage } from "@/lib/api-error";
import { getAuthToken, getSecureCookieFlag } from "@/lib/auth-token";
import axios from "axios";
import Cookies from "js-cookie";
import {
  Bookmark,
  Camera,
  ChartLine,
  Eye,
  Facebook,
  FilePenLine,
  Heart,
  ImageUp,
  Instagram,
  Linkedin,
  LoaderCircle,
  LogOut,
  Plus,
  Star,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import BlogsInsightsSection from "@/features/profile/private/components/BlogsInsightsSection";
import DraftsSection from "@/features/profile/private/components/DraftsSection";
import ProfilePageSkeleton from "@/features/profile/private/components/ProfilePageSkeleton";
import { useProfileBlogsInsights } from "@/features/profile/private/hooks/useProfileBlogsInsights";
import { toCount } from "@/features/profile/shared/metrics";

const ProfilePage = () => {
  const { user, loading, setUser, logoutUser, savedBlogs, setApiErrorMessage, clearApiError } =
    useAppData();
  const [hasHydrated, setHasHydrated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    instagram: "",
    facebook: "",
    linkedin: "",
    bio: "",
  });

  const getHeaders = useCallback(() => {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Please login first");
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const {
    authorTotals,
    draftState,
    publishedState,
    isInitialBlogLoad,
    selectedBlog,
    selectedBlogId,
    setSelectedBlogId,
    selectedBlogTitle,
    selectedBlogCategory,
    selectedBlogDateLabel,
    selectedBlogUrl,
    hasSelectedBlog,
    blogInsights,
    insightsSeries,
    insightFilter,
    setInsightFilter,
    insightLoading,
    selectedBlogStats,
    selectedBlogStatsLoading,
    refreshBlogLists,
    fetchSelectedBlogInsights,
    loadMoreDrafts,
    loadMorePublished,
  } = useProfileBlogsInsights({
    userId: user?._id,
    getHeaders,
  });

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || "",
        instagram: user.instagram || "",
        facebook: user.facebook || "",
        linkedin: user.linkedin || "",
        bio: user.bio || "",
      });
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const clickHandler = () => {
    inputRef.current?.click();
  };

  const clickBannerHandler = () => {
    bannerInputRef.current?.click();
  };

  const changeHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const imageFormData = new FormData();
    imageFormData.append("file", file);

    try {
      setIsUploadingImage(true);
      clearApiError();

      const { data } = await axios.post(`${user_service}/api/v1/user/update/pic`, imageFormData, {
        headers: getHeaders(),
      });

      toast.success(data.message ?? "Profile image updated");
      Cookies.set("token", data.token, {
        expires: 5,
        secure: getSecureCookieFlag(),
        path: "/",
      });
      setUser(data.user);
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Image update failed");
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFormSubmit = async () => {
    try {
      setIsUpdatingProfile(true);
      clearApiError();

      const { data } = await axios.post(`${user_service}/api/v1/user/update`, formData, {
        headers: getHeaders(),
      });

      toast.success(data.message ?? "Profile updated");
      Cookies.set("token", data.token, {
        expires: 5,
        secure: getSecureCookieFlag(),
        path: "/",
      });
      setUser(data.user);
      setApiErrorMessage(null);
      setOpen(false);
    } catch (error) {
      const message = getApiErrorMessage(error, "Profile update failed");
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const changeBannerHandler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const bannerFormData = new FormData();
    bannerFormData.append("file", file);

    try {
      setIsUploadingBanner(true);
      clearApiError();

      const { data } = await axios.post(`${user_service}/api/v1/user/update/banner`, bannerFormData, {
        headers: getHeaders(),
      });

      toast.success(data.message ?? "Profile banner updated");
      Cookies.set("token", data.token, {
        expires: 5,
        secure: getSecureCookieFlag(),
        path: "/",
      });
      setUser(data.user);
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Banner update failed");
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const privateStatItems = useMemo(
    () => [
      {
        id: "saved",
        label: "Saved",
        icon: Bookmark,
        iconClass: "text-sky-600",
        value: savedBlogs?.length ?? 0,
        loading: false,
      },
      {
        id: "stars",
        label: "Stars",
        icon: Star,
        iconClass: "text-amber-500",
        value: toCount(user?.starsCount),
        loading: false,
      },
      {
        id: "profileVisits",
        label: "Profile Visits",
        icon: Eye,
        iconClass: "text-indigo-600",
        value: toCount(user?.profileVisits),
        loading: false,
      },
      {
        id: "totalLikes",
        label: "Total Likes",
        icon: Heart,
        iconClass: "text-rose-500",
        value: authorTotals.totalLikes,
        loading: isInitialBlogLoad,
      },
      {
        id: "totalViews",
        label: "Total Views",
        icon: ChartLine,
        iconClass: "text-emerald-600",
        value: authorTotals.totalViews,
        loading: isInitialBlogLoad,
      },
      {
        id: "status",
        label: "Status",
        icon: ShieldCheck,
        iconClass: "text-amber-600",
        value: user?.role === "admin" ? "Admin" : "Active Writer",
        loading: false,
      },
    ],
    [
      savedBlogs?.length,
      user?.starsCount,
      user?.profileVisits,
      user?.role,
      authorTotals.totalLikes,
      authorTotals.totalViews,
      isInitialBlogLoad,
    ]
  );

  if (!hasHydrated || loading || !user) {
    return <ProfilePageSkeleton />;
  }

  return (
    <section className="mx-auto w-full max-w-[1500px] animate-fade-up space-y-6 py-6">
      <Card className="premium-panel relative gap-0 overflow-hidden border-0 py-0">
        <div className="group relative h-36 overflow-hidden sm:h-52">
          {user.banner ? (
            <img src={user.banner} alt={`${user.name} banner`} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.35),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(251,191,36,0.25),transparent_45%),linear-gradient(135deg,#0f172a,#1e293b_45%,#0f172a_100%)]" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.08),transparent_45%),linear-gradient(0deg,rgba(15,23,42,0.65),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-50 [background-size:24px_24px] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.2)_1px,transparent_0)]" />
          <div className="pointer-events-none absolute -left-10 top-6 h-28 w-28 rounded-full bg-sky-400/25 blur-3xl" />
          <div className="pointer-events-none absolute -right-6 bottom-0 h-32 w-32 rounded-full bg-amber-300/30 blur-3xl" />
          {!user.banner && (
            <button
              type="button"
              onClick={clickBannerHandler}
              className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/40 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-slate-900/75"
            >
              <ImageUp className="size-3.5" />
              Add banner image
            </button>
          )}
          <button
            type="button"
            onClick={clickBannerHandler}
            className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/35 bg-slate-900/55 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:bg-slate-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100"
          >
            {isUploadingBanner ? <LoaderCircle className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
            {isUploadingBanner ? "Uploading..." : user.banner ? "Edit Banner" : "Upload Banner"}
          </button>
          <input
            type="file"
            className="hidden"
            accept="image/*"
            ref={bannerInputRef}
            onChange={changeBannerHandler}
          />
        </div>
          <div className="pointer-events-none absolute -right-8 top-10 h-28 w-28 rounded-full bg-amber-300/30 blur-2xl" />
        <CardContent className="relative -mt-14 space-y-5 p-5 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="group relative">
                <Avatar
                  className="h-24 w-24 cursor-pointer border-4 border-white shadow-lg sm:h-28 sm:w-28"
                  onClick={clickHandler}
                >
                  <AvatarImage src={user.image} alt="profile pic" />
                </Avatar>
                <div className="pointer-events-none absolute bottom-1 right-1 rounded-full bg-primary p-1.5 text-primary-foreground shadow">
                  <Camera className="size-3.5" />
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  ref={inputRef}
                  onChange={changeHandler}
                />
              </div>
              <div>
                <h1 className="premium-section-title text-3xl font-semibold text-foreground">{user.name}</h1>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                {isUploadingImage && (
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Uploading image...
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button onClick={() => router.push("/blog/new")} className="rounded-full">
                <Plus className="mr-1 size-4" />
                New Blog
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-border bg-card/85"
                onClick={() => logoutUser()}
              >
                <LogOut className="mr-1 size-4" />
                Logout
              </Button>
            </div>
          </div>

          {user.bio ? (
            <p className="premium-panel-soft p-4 text-sm leading-relaxed text-muted-foreground">{user.bio}</p>
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-card/70 p-4 text-sm text-muted-foreground">
              Add a short bio to help readers know your writing style.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {privateStatItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="premium-kpi flex items-center justify-between gap-3 p-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={item.label}
                        className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card/70 transition hover:-translate-y-0.5"
                      >
                        <Icon className={`size-4 ${item.iconClass}`} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                  {item.loading ? (
                    <span className="h-7 w-20 animate-pulse rounded-md bg-muted" />
                  ) : (
                    <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {user.instagram && (
              <a
                href={user.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border bg-card p-2 text-pink-500 transition hover:-translate-y-0.5"
              >
                <Instagram className="size-5" />
              </a>
            )}
            {user.facebook && (
              <a
                href={user.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border bg-card p-2 text-blue-600 transition hover:-translate-y-0.5"
              >
                <Facebook className="size-5" />
              </a>
            )}
            {user.linkedin && (
              <a
                href={user.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border bg-card p-2 text-blue-700 transition hover:-translate-y-0.5"
              >
                <Linkedin className="size-5" />
              </a>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-full border-border bg-card/85">
                  <FilePenLine className="mr-1 size-4" /> Edit Profile
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                  <DialogTitle>Edit Profile</DialogTitle>
                </DialogHeader>

                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label>Name</Label>
                    <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bio</Label>
                    <textarea
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      className="min-h-24 rounded-xl border border-ft-border bg-ft-card px-3 py-2 text-sm text-ft-text outline-none focus:border-ft-accent/55"
                      placeholder="Write a short bio"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Instagram URL</Label>
                    <Input
                      value={formData.instagram}
                      onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Facebook URL</Label>
                    <Input
                      value={formData.facebook}
                      onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Linkedin URL</Label>
                    <Input
                      value={formData.linkedin}
                      onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    />
                  </div>

                  <Button onClick={handleFormSubmit} className="mt-2 w-full" disabled={isUpdatingProfile}>
                    {isUpdatingProfile ? (
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle className="size-4 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <BlogsInsightsSection
        authorTotals={authorTotals}
        publishedState={publishedState}
        draftState={draftState}
        selectedBlogId={selectedBlogId}
        onSelectBlog={setSelectedBlogId}
        selectedBlog={selectedBlog}
        selectedBlogTitle={selectedBlogTitle}
        selectedBlogCategory={selectedBlogCategory}
        selectedBlogDateLabel={selectedBlogDateLabel}
        hasSelectedBlog={hasSelectedBlog}
        blogInsights={blogInsights}
        insightsSeries={insightsSeries}
        insightFilter={insightFilter}
        onInsightFilterChange={setInsightFilter}
        onApplyInsights={() => void fetchSelectedBlogInsights()}
        insightLoading={insightLoading}
        selectedBlogStats={selectedBlogStats}
        selectedBlogStatsLoading={selectedBlogStatsLoading}
        onRefresh={() => void refreshBlogLists()}
        onLoadMorePublished={loadMorePublished}
        onOpenSelectedBlog={() => {
          if (selectedBlog) {
            router.push(selectedBlogUrl);
          }
        }}
      />

      <DraftsSection
        draftState={draftState}
        draftCount={authorTotals.draftBlogs}
        onLoadMoreDrafts={loadMoreDrafts}
        onOpenDraft={(blogId) => {
          router.push(`/blog/edit/${blogId}`);
        }}
      />
    </section>
  );
};

export default ProfilePage;
