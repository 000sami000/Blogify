import { AuthenticatedRequest } from "../middlewares/isAuth.js";
import getBuffer from "../utils/dataUri.js";
import { AppDataSource } from "../utils/db.js";
import {
  invalidateChacheJob,
  publishBlogDeletedJob,
} from "../utils/rabbitmq.js";
import TryCatch from "../utils/TryCatch.js";
import cloudinary from "cloudinary";
import { GoogleGenAI } from "@google/genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Blog } from "../entities/Blog.js";
import { SavedBlog } from "../entities/SavedBlog.js";

const parsePublishStatus = (value: unknown): "draft" | "published" => {
  return value === "draft" ? "draft" : "published";
};

const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return fallback;
};

const BLOG_ANALYTICS_CACHE_KEYS = ["admin:blog:insights:*", "blog:insights:*"];

type EditorJsBlock = {
  type: string;
  data: Record<string, unknown>;
};

type EditorJsDocument = {
  time: number;
  version: string;
  blocks: EditorJsBlock[];
};

const DEFAULT_EDITOR_VERSION = "2.31.4";

const createEmptyEditorDocument = (): EditorJsDocument => ({
  time: Date.now(),
  version: DEFAULT_EDITOR_VERSION,
  blocks: [{ type: "paragraph", data: { text: "" } }],
});

const toEditorJsBlockArray = (value: unknown): EditorJsBlock[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "object" && item !== null)
    .map((item) => {
      const candidate = item as { type?: unknown; data?: unknown };
      return {
        type: typeof candidate.type === "string" && candidate.type.trim() ? candidate.type : "paragraph",
        data:
          typeof candidate.data === "object" && candidate.data !== null
            ? (candidate.data as Record<string, unknown>)
            : {},
      };
    });
};

const isEditorJsDocument = (value: unknown): value is EditorJsDocument => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { blocks?: unknown };
  return Array.isArray(candidate.blocks);
};

const parseStringifiedJson = (value: string): unknown => {
  let current: unknown = value.trim();

  for (let i = 0; i < 3; i += 1) {
    if (typeof current !== "string") {
      return current;
    }

    const raw = current.trim();
    if (!(raw.startsWith("{") || raw.startsWith("[") || raw.startsWith("\""))) {
      return raw;
    }

    try {
      current = JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }

  return current;
};

const htmlToEditorDocument = (html: string): EditorJsDocument => {
  const trimmed = html.trim();

  if (!trimmed) {
    return createEmptyEditorDocument();
  }

  return {
    time: Date.now(),
    version: DEFAULT_EDITOR_VERSION,
    blocks: [
      {
        type: "raw",
        data: {
          html: trimmed,
        },
      },
    ],
  };
};

const normalizeEditorDocument = (input: unknown): EditorJsDocument => {
  if (isEditorJsDocument(input)) {
    const blocks = toEditorJsBlockArray(input.blocks);
    return {
      time: Number((input as { time?: unknown }).time) || Date.now(),
      version:
        typeof (input as { version?: unknown }).version === "string"
          ? ((input as { version?: string }).version as string)
          : DEFAULT_EDITOR_VERSION,
      blocks: blocks.length ? blocks : createEmptyEditorDocument().blocks,
    };
  }

  if (typeof input === "string") {
    const parsed = parseStringifiedJson(input);
    if (isEditorJsDocument(parsed)) {
      return normalizeEditorDocument(parsed);
    }

    if (typeof parsed === "string") {
      return htmlToEditorDocument(parsed);
    }
  }

  return createEmptyEditorDocument();
};

export const createBlog = TryCatch(async (req: AuthenticatedRequest, res) => {
  const { title, description, blogcontent, category } = req.body;
  const userid = req.user?._id;
  const publishStatus = parsePublishStatus(req.body.publishStatus);

  const file = req.file;

  if (!userid) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  // if (!file) {
  //   res.status(400).json({
  //     message: "No file to upload",
  //   });
  //   return;
  // }

  const fileBuffer = getBuffer(file);

  // if (!fileBuffer || !fileBuffer.content) {
  //   res.status(400).json({
  //     message: "Failed to generate buffer",
  //   });
  //   return;
  // }
  let cloud;
   if (fileBuffer && fileBuffer.content) {
   
     cloud = await cloudinary.v2.uploader.upload(fileBuffer.content, {
       folder: "blogs",
     });
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const result = await blogRepo.save(
    blogRepo.create({
      title,
      description,
      image: cloud?.secure_url? cloud?.secure_url : undefined,
      blogcontent: normalizeEditorDocument(blogcontent),
      category,
      author: userid,
      publishStatus,
    })
  );

  await invalidateChacheJob(["blogs:*", ...BLOG_ANALYTICS_CACHE_KEYS]);

  res.json({
    message: publishStatus === "draft" ? "Draft Saved" : "Blog Created",
    blog: result,
  });
});

export const updateBlog = TryCatch(async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { title, description, blogcontent, category } = req.body;
  const userid = req.user?._id;
  const publishStatus = parsePublishStatus(req.body.publishStatus);

  const file = req.file;

  if (!Number.isFinite(id)) {
    res.status(400).json({
      message: "Invalid blog id",
    });
    return;
  }

  if (!userid) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const blog = await blogRepo.findOne({ where: { id } });

  if (!blog) {
    res.status(404).json({
      message: "No blog with this id",
    });
    return;
  }

  const isAdmin = req.user?.role === "admin";

  if (blog.author !== userid && !isAdmin) {
    res.status(401).json({
      message: "You are not author of this blog",
    });
    return;
  }

  let imageUrl = blog.image;

  if (file) {
    const fileBuffer = getBuffer(file);

    if (!fileBuffer || !fileBuffer.content) {
      res.status(400).json({
        message: "Failed to generate buffer",
      });
      return;
    }

    const cloud = await cloudinary.v2.uploader.upload(fileBuffer.content, {
      folder: "blogs",
    });

    imageUrl = cloud.secure_url;
  }

  blog.title = title || blog.title;
  blog.description = description || blog.description;
  blog.image = imageUrl;
  if (blogcontent !== undefined) {
    blog.blogcontent = normalizeEditorDocument(blogcontent);
  }
  blog.category = category || blog.category;
  blog.publishStatus = publishStatus;
  blog.isActive = parseBoolean(req.body.isActive, blog.isActive);

  const updatedBlog = await blogRepo.save(blog);

  await invalidateChacheJob([
    "blogs:*",
    `blog:${id}`,
    `blog:${id}:*`,
    `blog:v2:${id}`,
    `blog:v2:${id}:*`,
    ...BLOG_ANALYTICS_CACHE_KEYS,
  ]);

  res.json({
    message: "Blog Updated",
    blog: updatedBlog,
  });
});

export const getBlogForEditor = TryCatch(async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const userid = req.user?._id;
  const isAdmin = req.user?.role === "admin";

  if (!Number.isFinite(id)) {
    res.status(400).json({
      message: "Invalid blog id",
    });
    return;
  }

  if (!userid) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const blog = await blogRepo.findOne({ where: { id } });

  if (!blog) {
    res.status(404).json({
      message: "No blog with this id",
    });
    return;
  }

  if (blog.author !== userid && !isAdmin) {
    res.status(403).json({
      message: "You are not allowed to view this blog",
    });
    return;
  }

  res.json(blog);
});

export const deleteBlog = TryCatch(async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const userid = req.user?._id;

  if (!Number.isFinite(id)) {
    res.status(400).json({
      message: "Invalid blog id",
    });
    return;
  }

  if (!userid) {
    res.status(401).json({
      message: "Unauthorized",
    });
    return;
  }

  const blogRepo = AppDataSource.getRepository(Blog);
  const blog = await blogRepo.findOne({ where: { id } });

  if (!blog) {
    res.status(404).json({
      message: "No blog with this id",
    });
    return;
  }

  const isAdmin = req.user?.role === "admin";

  if (blog.author !== userid && !isAdmin) {
    res.status(401).json({
      message: "You are not author of this blog",
    });
    return;
  }

  const savedBlogRepo = AppDataSource.getRepository(SavedBlog);

  await savedBlogRepo.delete({ blogid: id });
  await blogRepo.delete({ id });
  await publishBlogDeletedJob(id);

  await invalidateChacheJob([
    "blogs:*",
    `blog:${id}`,
    `blog:${id}:*`,
    `blog:v2:${id}`,
    `blog:v2:${id}:*`,
    ...BLOG_ANALYTICS_CACHE_KEYS,
  ]);

  res.json({
    message: "Blog Delete",
  });
});

export const setBlogModerationStatus = TryCatch(
  async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const requestedStatus = req.body.publishStatus;
    const requestedActive = req.body.isActive;

    if (!Number.isFinite(id)) {
      res.status(400).json({
        message: "Invalid blog id",
      });
      return;
    }

    const blogRepo = AppDataSource.getRepository(Blog);
    const blog = await blogRepo.findOne({ where: { id } });

    if (!blog) {
      res.status(404).json({
        message: "No blog with this id",
      });
      return;
    }

    if (requestedStatus !== undefined) {
      blog.publishStatus = parsePublishStatus(requestedStatus);
    }

    if (requestedActive !== undefined) {
      blog.isActive = Boolean(requestedActive);
    }

    const updated = await blogRepo.save(blog);
    await invalidateChacheJob([
      "blogs:*",
      `blog:${id}`,
      `blog:${id}:*`,
      `blog:v2:${id}`,
      `blog:v2:${id}:*`,
      ...BLOG_ANALYTICS_CACHE_KEYS,
    ]);

    res.json({
      message: "Blog moderation status updated",
      blog: updated,
    });
  }
);

export const aiTitleResponse = TryCatch(async (req, res) => {
  const { text } = req.body;

  const prompt = `Correct the grammar of the following blog title and return only the corrected title without any additional text, formatting, or symbols: "${text}"`;

  let result;

  const ai = new GoogleGenAI({
    apiKey: process.env.Gemini_Api_Key,
  });

  async function main() {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    let rawtext = response.text;

    if (!rawtext) {
      res.status(400).json({
        message: "Something went wrong",
      });
      return;
    }

    result = rawtext
      .replace(/\*\*/g, "")
      .replace(/[\r\n]+/g, "")
      .replace(/[*_`~]/g, "")
      .trim();
  }

  await main();

  res.json(result);
});

export const aiDescriptionResponse = TryCatch(async (req, res) => {
  const { title, description } = req.body;

  const prompt =
    description === ""
      ? `Generate only one short blog description based on this 
title: "${title}". Your response must be only one sentence, strictly under 30 words, with no options, no greetings, and 
no extra text. Do not explain. Do not say 'here is'. Just return the description only.`
      : `Fix the grammar in the 
following blog description and return only the corrected sentence. Do not add anything else: "${description}"`;

  let result;

  const ai = new GoogleGenAI({
    apiKey: process.env.Gemini_Api_Key,
  });

  async function main() {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    let rawtext = response.text;

    if (!rawtext) {
      res.status(400).json({
        message: "Something went wrong",
      });
      return;
    }

    result = rawtext
      .replace(/\*\*/g, "")
      .replace(/[\r\n]+/g, "")
      .replace(/[*_`~]/g, "")
      .trim();
  }

  await main();

  res.json(result);
});

export const aiBlogResponse = TryCatch(async (req, res) => {
  const prompt = ` You will act as a grammar correction engine. I will provide you with blog content 
in rich HTML format (from Jodit Editor). Do not generate or rewrite the content with new ideas. Only correct 
grammatical, punctuation, and spelling errors while preserving all HTML tags and formatting. Maintain inline styles, 
image tags, line breaks, and structural tags exactly as they are. Return the full corrected HTML string as output. `;

  const { blog } = req.body;
  if (!blog) {
    res.status(400).json({
      message: "Please provide blog",
    });
    return;
  }

  const fullMessage = `${prompt}\n\n${blog}`;

  const ai = new GoogleGenerativeAI(process.env.Gemini_Api_Key as string);

  const model = ai.getGenerativeModel({ model: "gemini-1.5-pro" });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            text: fullMessage,
          },
        ],
      },
    ],
  });

  const responseText = await result.response.text();

  const cleanedHtml = responseText
    .replace(/^(html|```html|```)\n?/i, "")
    .replace(/```$/i, "")
    .replace(/\*\*/g, "")
    .replace(/[\r\n]+/g, "")
    .replace(/[*_`~]/g, "")
    .trim();

  res.status(200).json({ html: cleanedHtml });
});
