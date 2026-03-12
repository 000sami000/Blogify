"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAuthToken } from "@/lib/auth-token";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  CheckCircle2,
  Clock3,
  FileImage,
  FileText,
  Gauge,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { author_service, blogCategories, useAppData } from "@/context/AppContext";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import BlockComposer, { BlockComposerHandle } from "@/features/editor/BlockComposer";
import type { BlockComposerChangePayload } from "@/features/editor/types";

const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 200;

const getPlainText = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);

const AddBlog = () => {
  const router = useRouter();
  const composerRef = useRef<BlockComposerHandle | null>(null);
  const blogContentRef = useRef("");
  const blogDocumentRef = useRef("");
  const blogPlainTextRef = useRef("");
  const metricsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [metricsHtml, setMetricsHtml] = useState("");

  const { fetchBlogs, setApiErrorMessage, clearApiError } = useAppData();

  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    image: null as File | null,
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "title") {
      setFormData((prev) => ({ ...prev, title: value.slice(0, MAX_TITLE_LENGTH) }));
      return;
    }

    if (name === "description") {
      setFormData((prev) => ({ ...prev, description: value.slice(0, MAX_DESCRIPTION_LENGTH) }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setFormData((prev) => ({ ...prev, image: file }));
  };

  const scheduleMetricsUpdate = useCallback((html: string) => {
    if (metricsTimerRef.current) {
      clearTimeout(metricsTimerRef.current);
    }

    metricsTimerRef.current = setTimeout(() => {
      setMetricsHtml(html);
    }, 450);
  }, []);

  const handleComposerChange = useCallback(
    (payload: BlockComposerChangePayload) => {
      blogContentRef.current = payload.html;
      blogPlainTextRef.current = payload.plainText;
      blogDocumentRef.current = JSON.stringify(payload.document);
      scheduleMetricsUpdate(payload.html);
    },
    [scheduleMetricsUpdate]
  );

  useEffect(() => {
    return () => {
      if (metricsTimerRef.current) {
        clearTimeout(metricsTimerRef.current);
      }
    };
  }, []);

  const bodyText = useMemo(() => getPlainText(metricsHtml), [metricsHtml]);
  const wordCount = useMemo(
    () => (bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0),
    [bodyText]
  );
  const readingMinutes = useMemo(() => Math.max(1, Math.ceil(wordCount / 220)), [wordCount]);
  const titleLength = formData.title.trim().length;
  const descriptionLength = formData.description.trim().length;
  const slugPreview = useMemo(() => toSlug(formData.title), [formData.title]);

  const completionChecks = useMemo(
    () => [
      {
        id: "title",
        label: "Strong title",
        done: titleLength >= 8,
      },
      {
        id: "description",
        label: "Useful summary",
        done: descriptionLength >= 20,
      },
      {
        id: "category",
        label: "Category selected",
        done: Boolean(formData.category),
      },
      {
        id: "body",
        label: "Body has depth",
        done: bodyText.length >= 80,
      },
      {
        id: "cover",
        label: "Cover image added",
        done: Boolean(formData.image),
      },
    ],
    [titleLength, descriptionLength, formData.category, bodyText.length, formData.image]
  );

  const completedCount = completionChecks.filter((item) => item.done).length;
  const completionScore = Math.round((completedCount / completionChecks.length) * 100);

  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!formData.image) {
      setCoverPreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(formData.image);
    setCoverPreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [formData.image]);

  const validateForm = (publishStatus: "draft" | "published") => {
    const plainBodyLength = blogPlainTextRef.current.length;

    if (publishStatus === "draft") {
      if (titleLength < 3) {
        return "Draft title must be at least 3 characters long.";
      }
      return null;
    }

    if (titleLength < 8) {
      return "Title must be at least 8 characters long.";
    }
    if (titleLength > MAX_TITLE_LENGTH) {
      return `Title cannot exceed ${MAX_TITLE_LENGTH} characters.`;
    }
    if (descriptionLength < 20) {
      return "Description must be at least 20 characters long.";
    }
    if (descriptionLength > MAX_DESCRIPTION_LENGTH) {
      return `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`;
    }
    if (!formData.category) {
      return "Please choose a category.";
    }
    if (plainBodyLength < 80) {
      return "Blog content is too short. Please add more details.";
    }
    return null;
  };

  const submitBlog = async (publishStatus: "draft" | "published") => {
    const validationMessage = validateForm(publishStatus);
    if (validationMessage) {
      setPageError(validationMessage);
      setApiErrorMessage(validationMessage);
      toast.error(validationMessage);
      return;
    }

    setLoading(true);
    clearApiError();

    const fromDataToSend = new FormData();

    fromDataToSend.append("title", formData.title);
    fromDataToSend.append("description", formData.description);
    fromDataToSend.append("blogcontent", blogDocumentRef.current || blogContentRef.current);
    fromDataToSend.append("category", formData.category);
    fromDataToSend.append("publishStatus", publishStatus);

    if (formData.image) {
      fromDataToSend.append("file", formData.image);
    }

    try {
      const token = getAuthToken();
      if (!token) {
        const message = "Please login first";
        setPageError(message);
        setApiErrorMessage(message);
        toast.error(message);
        return;
      }
      const { data } = await axios.post(`${author_service}/api/v1/blog/new`, fromDataToSend, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      toast.success(data.message);
      if (publishStatus === "draft" && data?.blog?.id) {
        router.push(`/blog/edit/${data.blog.id}`);
        return;
      }

      setFormData({
        title: "",
        description: "",
        category: "",
        image: null,
      });
      blogContentRef.current = "";
      blogDocumentRef.current = "";
      blogPlainTextRef.current = "";
      composerRef.current?.setFromHtml("");
      setMetricsHtml("");
      setPageError(null);
      setApiErrorMessage(null);
      setTimeout(() => {
        fetchBlogs();
      }, 1200);
    } catch (error) {
      const message = getApiErrorMessage(error, "Error while adding blog");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitBlog("published");
  };

  const [aiTitle, setAiTitle] = useState(false);

  const aiTitleResponse = async () => {
    try {
      setAiTitle(true);
      clearApiError();
      const { data } = await axios.post(`${author_service}/api/v1/ai/title`, {
        text: formData.title,
      });
      setFormData((prev) => ({ ...prev, title: String(data ?? "").slice(0, MAX_TITLE_LENGTH) }));
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Problem while generating title with AI");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setAiTitle(false);
    }
  };

  const [aiDescription, setAiDescription] = useState(false);

  const aiDescriptionResponse = async () => {
    try {
      setAiDescription(true);
      clearApiError();
      const { data } = await axios.post(`${author_service}/api/v1/ai/descripiton`, {
        title: formData.title,
        description: formData.description,
      });
      setFormData((prev) => ({
        ...prev,
        description: String(data ?? "").slice(0, MAX_DESCRIPTION_LENGTH),
      }));
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Problem while generating description with AI");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setAiDescription(false);
    }
  };

  const [aiBlogLoading, setAiBlogLoading] = useState(false);

  const aiBlogResponse = async () => {
    try {
      setAiBlogLoading(true);
      clearApiError();
      const { data } = await axios.post(`${author_service}/api/v1/ai/blog`, {
        blog: blogContentRef.current,
      });
      const aiHtml = String(data?.html ?? "");
      blogContentRef.current = aiHtml;
      composerRef.current?.setFromHtml(aiHtml);
      setMetricsHtml(aiHtml);
      setApiErrorMessage(null);
    } catch (error) {
      const message = getApiErrorMessage(error, "Problem while improving content with AI");
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setAiBlogLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-none animate-fade-up py-6">
      <div className="premium-panel mb-6 overflow-hidden border-0 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-ft-muted">Creator Studio</p>
        <h1 className="premium-section-title mt-2 text-3xl font-semibold text-foreground sm:text-4xl">
          Write With Editorial Clarity
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Focused writing flow with quick quality checks before you publish.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <Card className="overflow-hidden border border-border bg-card shadow-sm">
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="grid gap-4">
                <div>
                  <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Title</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      placeholder="The rise of edge AI in healthcare"
                      maxLength={MAX_TITLE_LENGTH}
                      className={aiTitle ? "animate-pulse" : ""}
                      required
                    />
                    {formData.title.trim() && (
                      <Button
                        type="button"
                        onClick={aiTitleResponse}
                        disabled={aiTitle}
                        variant="outline"
                        className="shrink-0"
                        title="Regenerate title"
                      >
                        <RefreshCw className={aiTitle ? "animate-spin" : ""} />
                      </Button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Slug preview: /blog/{slugPreview || "your-title"}
                  </p>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Description</Label>
                  <div className="mt-2 flex items-start gap-2">
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Write a concise summary that helps readers decide to open your article."
                      maxLength={MAX_DESCRIPTION_LENGTH}
                      className={`min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                        aiDescription ? "animate-pulse" : ""
                      }`}
                      required
                    />
                    {formData.title.trim() && (
                      <Button
                        onClick={aiDescriptionResponse}
                        type="button"
                        disabled={aiDescription}
                        variant="outline"
                        className="shrink-0"
                        title="Regenerate description"
                      >
                        <RefreshCw className={aiDescription ? "animate-spin" : ""} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="space-y-3 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Writing Canvas</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Keep paragraphs short, add meaningful headings, and use visuals where useful.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={aiBlogResponse}
                  disabled={aiBlogLoading}
                  variant="outline"
                  className="rounded-full"
                >
                  <Sparkles size={16} className="mr-1" />
                  <RefreshCw size={14} className={aiBlogLoading ? "animate-spin" : ""} />
                  <span className="ml-2">Polish With AI</span>
                </Button>
              </div>

              <BlockComposer ref={composerRef} onChange={handleComposerChange} />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">Publish Settings</h2>

              <div>
                <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {blogCategories.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Cover Image</Label>
                <Input type="file" accept="image/*" onChange={handleFileChange} className="mt-2" />
                {coverPreview && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-border">
                    <img src={coverPreview} alt="Cover preview" className="h-40 w-full object-cover" />
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Use a clean 16:9 image for better feed and detail page quality.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-foreground">Live Metrics</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-border bg-background/70 p-2">
                  <p className="text-xs text-muted-foreground">Words</p>
                  <p className="font-semibold text-foreground">{wordCount}</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-2">
                  <p className="text-xs text-muted-foreground">Reading Time</p>
                  <p className="font-semibold text-foreground">{readingMinutes} min</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-2">
                  <p className="text-xs text-muted-foreground">Title</p>
                  <p className="font-semibold text-foreground">{titleLength} chars</p>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-2">
                  <p className="text-xs text-muted-foreground">Summary</p>
                  <p className="font-semibold text-foreground">{descriptionLength} chars</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/70 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Gauge className="size-3.5" /> Completion
                  </span>
                  <span className="font-semibold text-foreground">{completionScore}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${completionScore}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-foreground">Checklist</h2>
              <ul className="space-y-2 text-sm">
                {completionChecks.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2
                      className={`size-4 ${item.done ? "text-emerald-600" : "text-muted-foreground/50"}`}
                    />
                    <span className={item.done ? "text-foreground" : ""}>{item.label}</span>
                  </li>
                ))}
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Clock3 className="size-4" />
                  <span>Estimated read: {readingMinutes} min</span>
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="size-4" />
                  <span>Body length: {bodyText.length} chars</span>
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <FileImage className="size-4" />
                  <span>{formData.image ? "Cover ready" : "Add a cover image"}</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {pageError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {pageError}
            </p>
          )}

          <div className="space-y-2">
            <Button
              type="submit"
              className="h-11 w-full rounded-xl bg-ft-accent text-ft-bg hover:brightness-95"
              disabled={loading}
            >
              <Wand2 className="mr-2 size-4" />
              {loading ? "Publishing..." : "Publish Blog"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-xl"
              disabled={loading}
              onClick={() => {
                void submitBlog("draft");
              }}
            >
              {loading ? "Saving..." : "Save as Draft"}
            </Button>
          </div>
        </aside>
      </form>
    </section>
  );
};

export default AddBlog;
