"use client";

import Loading from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  author_service,
  blogCategories,
  useAppData,
} from "@/context/AppContext";
import toast from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import BlockComposer, { BlockComposerHandle } from "@/features/editor/BlockComposer";
import type { BlockComposerChangePayload } from "@/features/editor/types";
import { contentToEditorData, editorDataToPlainText } from "@/features/editor/utils";

const MAX_TITLE_LENGTH = 140;
const MAX_DESCRIPTION_LENGTH = 200;

const getBodyLengthFromContent = (content: string) => {
  try {
    const data = contentToEditorData(content);
    return editorDataToPlainText(data).length;
  } catch {
    return String(content ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim().length;
  }
};

const resolveBlogRecord = (payload: unknown) => {
  const data = (payload ?? {}) as Record<string, unknown>;
  const candidate =
    typeof data.blog === "object" && data.blog !== null
      ? (data.blog as Record<string, unknown>)
      : data;

  const rawContent =
    candidate.blogcontent ??
    candidate.blogContent ??
    candidate.blog_content ??
    "";

  const normalizedContent =
    typeof rawContent === "string"
      ? rawContent
      : rawContent && typeof rawContent === "object"
        ? JSON.stringify(rawContent)
        : String(rawContent ?? "");

  return {
    title: String(candidate.title ?? ""),
    description: String(candidate.description ?? ""),
    category: String(candidate.category ?? ""),
    image: typeof candidate.image === "string" ? candidate.image : null,
    blogcontent: normalizedContent,
    publishStatus: candidate.publishStatus === "draft" ? "draft" : "published",
    isActive:
      typeof candidate.isActive === "boolean"
        ? candidate.isActive
        : typeof candidate.is_active === "boolean"
          ? candidate.is_active
          : true,
  } as const;
};

const EditBlogPage = () => {
  const router = useRouter();

  const { fetchBlogs, setApiErrorMessage, clearApiError } = useAppData();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    image: null as File | null,
    publishStatus: "published" as "draft" | "published",
    isActive: true,
  });
  const [pageError, setPageError] = useState<string | null>(null);
  const [editorInitialHtml, setEditorInitialHtml] = useState("");
  const [bodyLength, setBodyLength] = useState(0);
  const composerRef = React.useRef<BlockComposerHandle | null>(null);
  const blogContentDocumentRef = React.useRef("");
  const composerKey = `${id ?? "blog"}:${editorInitialHtml.length}:${editorInitialHtml.slice(0, 24)}`;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "title") {
      setFormData({ ...formData, title: value.slice(0, MAX_TITLE_LENGTH) });
      return;
    }
    if (name === "description") {
      setFormData({ ...formData, description: value.slice(0, MAX_DESCRIPTION_LENGTH) });
      return;
    }
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setFormData({ ...formData, image: file });
  };

  const [existingImage, setExistingImage] = useState<string | null>(null);

  const validateForm = (publishStatus: "draft" | "published") => {
    if (publishStatus === "draft") {
      if (formData.title.trim().length < 3) {
        return "Draft title must be at least 3 characters long.";
      }
      return null;
    }

    if (formData.title.trim().length < 8) {
      return "Title must be at least 8 characters long.";
    }
    if (formData.title.trim().length > MAX_TITLE_LENGTH) {
      return `Title cannot exceed ${MAX_TITLE_LENGTH} characters.`;
    }
    if (formData.description.trim().length < 20) {
      return "Description must be at least 20 characters long.";
    }
    if (formData.description.trim().length > MAX_DESCRIPTION_LENGTH) {
      return `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`;
    }
    if (!formData.category) {
      return "Please choose a category.";
    }
    if (bodyLength < 80) {
      return "Blog content is too short. Please add more details.";
    }
    return null;
  };

  useEffect(() => {
    const fetchBlog = async () => {
      setLoading(true);
      try {
        clearApiError();
        const token = getAuthToken();
        if (!token) {
          const message = "Please login first";
          setPageError(message);
          setApiErrorMessage(message);
          toast.error(message);
          return;
        }

        const { data } = await axios.get(`${author_service}/api/v1/blog/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const blog = resolveBlogRecord(data);
        const initialContent = blog.blogcontent;

        setFormData({
          title: String(blog.title ?? "").slice(0, MAX_TITLE_LENGTH),
          description: String(blog.description ?? "").slice(0, MAX_DESCRIPTION_LENGTH),
          category: blog.category,
          image: null,
          publishStatus: blog.publishStatus || "published",
          isActive: blog.isActive,
        });

        setEditorInitialHtml(initialContent);
        blogContentDocumentRef.current = initialContent;
        setBodyLength(getBodyLengthFromContent(initialContent));
        setExistingImage(blog.image);
        setPageError(null);
        setApiErrorMessage(null);
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to load blog for editing");
        setPageError(message);
        setApiErrorMessage(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchBlog();
  }, [id, setApiErrorMessage, clearApiError]);

  useEffect(() => {
    if (!editorInitialHtml || loading) {
      return;
    }

    const timer = setTimeout(() => {
      composerRef.current?.setFromHtml(editorInitialHtml);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [editorInitialHtml, loading]);

  const submitBlog = async (publishStatus: "draft" | "published") => {
    if (!id) {
      const message = "Invalid blog id.";
      setPageError(message);
      setApiErrorMessage(message);
      toast.error(message);
      return;
    }

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
    fromDataToSend.append("blogcontent", blogContentDocumentRef.current);
    fromDataToSend.append("category", formData.category);
    fromDataToSend.append("publishStatus", publishStatus);
    fromDataToSend.append("isActive", String(formData.isActive));

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
      const { data } = await axios.post(
        `${author_service}/api/v1/blog/${id}`,
        fromDataToSend,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      toast.success(data.message);
      fetchBlogs();
      setPageError(null);
      setApiErrorMessage(null);
      router.push(`/blog/${id}`);
    } catch (error) {
      const message = getApiErrorMessage(error, "Error while updating blog");
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

  if (loading) {
    return <Loading />;
  }

  return (
    <section className="mx-auto w-full max-w-none animate-fade-up py-6">
      <Card className="premium-panel border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Creator Studio</p>
          <CardTitle className="premium-section-title text-3xl text-foreground sm:text-4xl">Edit blog</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <div className="premium-panel-soft space-y-2 p-4">
                <Label>Title</Label>
                <Input
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="Enter blog title"
                  maxLength={MAX_TITLE_LENGTH}
                  required
                />
                <p className="text-right text-xs text-muted-foreground">
                  {formData.title.trim().length}/{MAX_TITLE_LENGTH}
                </p>
              </div>

              <div className="premium-panel-soft space-y-2 p-4">
                <Label>Description</Label>
                <Input
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Enter blog description"
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  required
                />
                <p className="text-right text-xs text-muted-foreground">
                  {formData.description.trim().length}/{MAX_DESCRIPTION_LENGTH}
                </p>
              </div>

              <div className="premium-panel-soft space-y-2 p-4">
                <Label>Blog Content</Label>
                <p className="text-xs text-muted-foreground">Update the article and keep a clear narrative flow.</p>
                <BlockComposer
                  key={composerKey}
                  ref={composerRef}
                  initialHtml={editorInitialHtml}
                  onChange={(payload) => {
                    const typedPayload = payload as BlockComposerChangePayload;
                    const nextContent = JSON.stringify(typedPayload.document);
                    blogContentDocumentRef.current = nextContent;
                    setBodyLength(typedPayload.plainText.length);
                  }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="premium-panel-soft p-4">
                <Label>Category</Label>
                <Select onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder={formData.category || "Select category"} />
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

              <div className="premium-panel-soft p-4">
                <Label>Visibility</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Inactive blogs stay in your dashboard but are hidden from public feeds.
                </p>
                <Select
                  value={formData.isActive ? "active" : "inactive"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, isActive: value === "active" })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="premium-panel-soft p-4">
                <Label>Cover Image</Label>
                {existingImage && !formData.image && (
                  <img
                    src={existingImage}
                    className="mt-2 h-44 w-full rounded-xl object-cover"
                    alt="Current cover"
                  />
                )}
                <Input type="file" accept="image/*" onChange={handleFileChange} className="mt-2" />
              </div>

              <div className="premium-panel-soft p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Quick checks</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>Title length: {formData.title.trim().length}/{MAX_TITLE_LENGTH}</li>
                  <li>Description length: {formData.description.trim().length}/{MAX_DESCRIPTION_LENGTH}</li>
                  <li>Body length: {bodyLength}</li>
                  <li>Visibility: {formData.isActive ? "Active" : "Inactive"}</li>
                </ul>
              </div>

              {pageError && <p className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">{pageError}</p>}

              <Button
                type="submit"
                className="h-11 w-full rounded-xl"
                disabled={loading}
              >
                <Save className="mr-2 size-4" />
                {loading ? "Saving..." : "Save Changes"}
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
          </form>
        </CardContent>
      </Card>
    </section>
  );
};

export default EditBlogPage;
