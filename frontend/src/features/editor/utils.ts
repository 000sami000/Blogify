import type { OutputData } from "@editorjs/editorjs";
import type { BlockComposerChangePayload, TocItem } from "./types";

type LooseBlock = {
  type: string;
  data: Record<string, unknown>;
};
type ListItem = {
  content?: string;
  text?: string;
  checked?: boolean;
  meta?: Record<string, unknown>;
  items?: ListItem[];
};

const DEFAULT_EDITOR_VERSION = "2.31.4";

const HEADING_TOOL_LEVEL_MAP: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

const normalizeHeadingBlocks = (blocks: OutputData["blocks"]): OutputData["blocks"] =>
  blocks.map((block) => {
    if (!block || typeof block.type !== "string") {
      return block;
    }

    const data = (block.data || {}) as Record<string, unknown>;
    const levelFromType = HEADING_TOOL_LEVEL_MAP[block.type];
    const levelFromData = Number(data.level);

    if (block.type === "header" || levelFromType) {
      const level = Math.min(
        6,
        Math.max(
          1,
          Number.isFinite(levelFromData) && levelFromData > 0
            ? levelFromData
            : levelFromType || 2
        )
      );

      return {
        ...block,
        type: "header",
        data: {
          ...data,
          level,
          text: String(data.text || ""),
        },
      } as OutputData["blocks"][number];
    }

    return block;
  });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeAttr = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);

const normalizeOutput = (output?: OutputData | null): OutputData => {
  const base: OutputData =
    output?.blocks?.length
      ? output
      : {
          time: Date.now(),
          version: DEFAULT_EDITOR_VERSION,
          blocks: [{ type: "paragraph", data: { text: "" } }],
        };

  return {
    ...base,
    blocks: normalizeHeadingBlocks(base.blocks),
  };
};

const getEmbedDetails = (url: string) => {
  const source = url.trim();
  if (!source) {
    return null;
  }

  const youtubeMatch =
    source.match(/youtube\.com\/watch\?v=([^&]+)/i) || source.match(/youtu\.be\/([^?&/]+)/i);
  if (youtubeMatch?.[1]) {
    return {
      service: "youtube",
      source,
      embed: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
      width: 640,
      height: 360,
    };
  }

  const vimeoMatch = source.match(/vimeo\.com\/(\d+)/i);
  if (vimeoMatch?.[1]) {
    return {
      service: "vimeo",
      source,
      embed: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      width: 640,
      height: 360,
    };
  }

  return {
    service: "custom",
    source,
    embed: source,
    width: 640,
    height: 360,
  };
};

const parseListItemsFromElement = (listElement: Element): ListItem[] =>
  Array.from(listElement.children)
    .filter((child) => child.tagName.toLowerCase() === "li")
    .map((itemElement) => {
      const clone = itemElement.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("ul, ol").forEach((nested) => nested.remove());

      const nestedLists = Array.from(itemElement.children).filter((child) => {
        const tag = child.tagName.toLowerCase();
        return tag === "ul" || tag === "ol";
      });

      const nestedItems = nestedLists.flatMap((nested) => parseListItemsFromElement(nested));

      return {
        content: clone.innerHTML.trim() || escapeHtml(itemElement.textContent?.trim() || ""),
        meta: {},
        items: nestedItems,
      };
    });

const buildTocFromBlocks = (blocks: OutputData["blocks"]): TocItem[] => {
  const usedIds = new Set<string>();
  const toc: TocItem[] = [];

  for (const block of blocks) {
    const heading = getHeadingMeta(block);
    if (!heading) {
      continue;
    }

    const level = heading.level;
    if (level !== 2 && level !== 3) {
      continue;
    }

    const label = stripHtml(heading.text);
    if (!label) {
      continue;
    }

    let id = slugify(label) || `section-${toc.length + 1}`;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${slugify(label)}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);
    toc.push({ id, label, level: level as 2 | 3 });
  }

  return toc;
};

const renderListItems = (items: ListItem[], style: "ordered" | "unordered" | "checklist"): string =>
  items
    .map((item) => {
      const content = (item.content || item.text || "").toString();
      const nested = item.items?.length
        ? style === "ordered"
          ? `<ol>${renderListItems(item.items, style)}</ol>`
          : `<ul>${renderListItems(item.items, style)}</ul>`
        : "";

      if (style === "checklist") {
        const checked = Boolean(item.checked || item.meta?.checked);
        return `<li><label><input type="checkbox" disabled ${checked ? "checked" : ""} /> ${content}</label>${nested}</li>`;
      }

      return `<li>${content}${nested}</li>`;
    })
    .join("");

const flattenListText = (items: ListItem[]): string =>
  items
    .flatMap((item) => {
      const content = stripHtml(String(item.content || item.text || ""));
      const nested = item.items?.length ? flattenListText(item.items) : "";
      return [content, nested].filter(Boolean);
    })
    .join(" ");

const getHeadingMeta = (block: OutputData["blocks"][number]) => {
  if (!block || typeof block.type !== "string") {
    return null;
  }

  const blockData = (block.data || {}) as Record<string, unknown>;
  const isHeaderType =
    block.type === "header" || Object.prototype.hasOwnProperty.call(HEADING_TOOL_LEVEL_MAP, block.type);

  if (!isHeaderType) {
    return null;
  }

  const levelFromType = HEADING_TOOL_LEVEL_MAP[block.type] ?? 0;
  const levelFromData = Number(blockData.level);
  const level = Math.min(
    6,
    Math.max(
      1,
      Number.isFinite(levelFromData) && levelFromData > 0 ? levelFromData : levelFromType || 2
    )
  );

  return {
    level,
    text: String(blockData.text || ""),
  };
};

export const editorDataToHtml = (output: OutputData): string => {
  const data = normalizeOutput(output);
  const toc = buildTocFromBlocks(data.blocks);
  const tocMap = new Map(toc.map((item) => [item.label, item.id]));
  const usedHeadingIds = new Set<string>();

  return data.blocks
    .map((block) => {
      const blockData = (block.data || {}) as Record<string, unknown>;
      const heading = getHeadingMeta(block);

      if (block.type === "paragraph") {
        return `<p>${String(blockData.text || "")}</p>`;
      }

      if (heading) {
        const level = heading.level;
        const headingHtml = heading.text;
        const label = stripHtml(headingHtml);
        let id = tocMap.get(label) || slugify(label);
        if (!id) {
          return `<h${level}>${headingHtml}</h${level}>`;
        }
        let suffix = 2;
        while (usedHeadingIds.has(id)) {
          id = `${id}-${suffix}`;
          suffix += 1;
        }
        usedHeadingIds.add(id);
        return `<h${level} id="${escapeAttr(id)}" class="toc-anchor">${headingHtml}</h${level}>`;
      }

      if (block.type === "list") {
        const style = String(blockData.style || "unordered") as "ordered" | "unordered" | "checklist";
        const items = Array.isArray(blockData.items) ? (blockData.items as ListItem[]) : [];
        if (style === "ordered") {
          const start = Number((blockData.meta as Record<string, unknown>)?.start || 1);
          return `<ol${start > 1 ? ` start="${start}"` : ""}>${renderListItems(items, "ordered")}</ol>`;
        }
        if (style === "checklist") {
          return `<ul class="editorjs-checklist">${renderListItems(items, "checklist")}</ul>`;
        }
        return `<ul>${renderListItems(items, "unordered")}</ul>`;
      }

      if (block.type === "checklist") {
        const items = (Array.isArray(blockData.items) ? blockData.items : []) as ListItem[];
        return `<ul class="editorjs-checklist">${renderListItems(items, "checklist")}</ul>`;
      }

      if (block.type === "quote") {
        const text = String(blockData.text || "");
        const caption = String(blockData.caption || "");
        return `<blockquote><p>${text}</p>${caption ? `<cite>${escapeHtml(caption)}</cite>` : ""}</blockquote>`;
      }

      if (block.type === "code") {
        const code = String(blockData.code || "");
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
      }

      if (block.type === "delimiter") {
        return "<hr />";
      }

      if (block.type === "table") {
        const content = (Array.isArray(blockData.content) ? blockData.content : []) as string[][];
        const withHeadings = Boolean(blockData.withHeadings);
        if (!content.length) {
          return "";
        }

        const rows = content
          .map((row, rowIndex) => {
            const tag = withHeadings && rowIndex === 0 ? "th" : "td";
            const columns = row.map((cell) => `<${tag}>${cell || ""}</${tag}>`).join("");
            return `<tr>${columns}</tr>`;
          })
          .join("");

        return `<table><tbody>${rows}</tbody></table>`;
      }

      if (block.type === "image") {
        const url = String((blockData.file as Record<string, unknown>)?.url || blockData.url || "");
        if (!url) {
          return "";
        }
        const caption = String(blockData.caption || "");
        return `<figure><img src="${escapeAttr(url)}" alt="${escapeAttr(
          stripHtml(caption || "Blog image")
        )}" />${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
      }

      if (block.type === "embed") {
        const src = String(blockData.embed || blockData.source || "");
        if (!src) {
          return "";
        }
        const caption = String(blockData.caption || "");
        return `<figure><div class="video-embed"><iframe src="${escapeAttr(
          src
        )}" title="Embedded media" loading="lazy" frameborder="0" allowfullscreen></iframe></div>${
          caption ? `<figcaption>${caption}</figcaption>` : ""
        }</figure>`;
      }

      if (block.type === "warning") {
        const title = escapeHtml(String(blockData.title || ""));
        const message = escapeHtml(String(blockData.message || ""));
        return `<aside class="editorjs-warning"><strong>${title}</strong><p>${message}</p></aside>`;
      }

      if (block.type === "linkTool") {
        const link = String(blockData.link || "");
        if (!link) {
          return "";
        }
        const meta = (blockData.meta || {}) as Record<string, unknown>;
        const title = escapeHtml(String(meta.title || link));
        const description = escapeHtml(String(meta.description || ""));
        return `<p><a href="${escapeAttr(
          link
        )}" target="_blank" rel="noopener noreferrer">${title}</a>${description ? ` - ${description}` : ""}</p>`;
      }

      if (block.type === "raw") {
        return String(blockData.html || "");
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
};

export const editorDataToPlainText = (output: OutputData): string =>
  normalizeOutput(output)
    .blocks.map((block) => {
      const data = (block.data || {}) as Record<string, unknown>;
      const heading = getHeadingMeta(block);

      if (heading) {
        return stripHtml(heading.text);
      }

      if (block.type === "paragraph" || block.type === "quote") {
        return stripHtml(String(data.text || ""));
      }

      if (block.type === "list") {
        const items = (Array.isArray(data.items) ? data.items : []) as ListItem[];
        return flattenListText(items);
      }

      if (block.type === "checklist") {
        const items = (Array.isArray(data.items) ? data.items : []) as ListItem[];
        return flattenListText(items);
      }

      if (block.type === "code") {
        return String(data.code || "");
      }

      if (block.type === "table") {
        const rows = (Array.isArray(data.content) ? data.content : []) as string[][];
        return rows.flat().map((cell) => stripHtml(String(cell || ""))).join(" ");
      }

      if (block.type === "image" || block.type === "embed") {
        return stripHtml(String(data.caption || ""));
      }

      if (block.type === "warning") {
        return `${String(data.title || "")} ${String(data.message || "")}`.trim();
      }

      if (block.type === "linkTool") {
        const meta = (data.meta || {}) as Record<string, unknown>;
        return `${String(meta.title || "")} ${String(meta.description || "")} ${String(data.link || "")}`.trim();
      }

      if (block.type === "raw") {
        return stripHtml(String(data.html || ""));
      }

      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

export const outputToPayload = (output?: OutputData | null): BlockComposerChangePayload => {
  const data = normalizeOutput(output);
  return {
    html: editorDataToHtml(data),
    plainText: editorDataToPlainText(data),
    toc: buildTocFromBlocks(data.blocks),
    blocks: data.blocks,
    document: data,
  };
};

export const createEmptyEditorData = (): OutputData => normalizeOutput();

const isOutputDataShape = (value: unknown): value is OutputData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { blocks?: unknown };
  return Array.isArray(candidate.blocks);
};

const parsePossibleEditorData = (value: unknown): OutputData | null => {
  if (isOutputDataShape(value)) {
    return normalizeOutput(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  let raw = value.trim();
  if (!raw) {
    return null;
  }

  for (let i = 0; i < 3; i += 1) {
    if (!(raw.startsWith("{") || raw.startsWith("[") || raw.startsWith("\""))) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isOutputDataShape(parsed)) {
        return normalizeOutput(parsed);
      }

      if (typeof parsed === "string") {
        raw = parsed.trim();
        continue;
      }
      return null;
    } catch {
      return null;
    }
  }

  return null;
};

export const contentToEditorData = (content: unknown): OutputData => {
  const normalizeLegacyRawWrapper = (output: OutputData): OutputData => {
    if (!Array.isArray(output.blocks) || output.blocks.length !== 1) {
      return output;
    }

    const [single] = output.blocks;
    if (single?.type !== "raw") {
      return output;
    }

    const rawHtml = (single.data as Record<string, unknown> | undefined)?.html;
    if (typeof rawHtml !== "string" || !rawHtml.trim()) {
      return output;
    }

    // Older migration path wrapped legacy HTML into one raw block.
    // Expand it into normal Editor.js blocks so the canvas is directly editable.
    return htmlToEditorData(rawHtml);
  };

  const parsed = parsePossibleEditorData(content);
  if (parsed) {
    return normalizeLegacyRawWrapper(parsed);
  }

  if (typeof content === "string") {
    return htmlToEditorData(content);
  }

  if (content === null || content === undefined) {
    return createEmptyEditorData();
  }

  return htmlToEditorData(String(content));
};

export const htmlToEditorData = (html: string): OutputData => {
  if (!html?.trim() || typeof window === "undefined") {
    return createEmptyEditorData();
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const blocks: LooseBlock[] = [];
  const directChildren = Array.from(document.body.children);

  let nodesToParse = directChildren;
  if (directChildren.length === 1) {
    const onlyChild = directChildren[0];
    const tag = onlyChild.tagName.toLowerCase();
    if (
      ["div", "section", "article", "main"].includes(tag) &&
      onlyChild.children.length > 0
    ) {
      nodesToParse = Array.from(onlyChild.children);
    }
  }

  for (const node of nodesToParse) {
    const tag = node.tagName.toLowerCase();

    if (tag === "p") {
      blocks.push({ type: "paragraph", data: { text: (node as HTMLElement).innerHTML.trim() } });
      continue;
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.replace("h", "")) || 2;
      blocks.push({
        type: "header",
        data: {
          text: (node as HTMLElement).innerHTML.trim(),
          level,
        },
      });
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      blocks.push({
        type: "list",
        data: {
          style: tag === "ol" ? "ordered" : "unordered",
          items: parseListItemsFromElement(node),
          meta: tag === "ol" ? { start: Number(node.getAttribute("start") || "1"), counterType: "numeric" } : {},
        },
      });
      continue;
    }

    if (tag === "blockquote") {
      blocks.push({
        type: "quote",
        data: {
          text: (node.querySelector("p")?.innerHTML || (node as HTMLElement).innerHTML || "").trim(),
          caption: node.querySelector("cite")?.textContent?.trim() || "",
        },
      });
      continue;
    }

    if (tag === "pre") {
      blocks.push({
        type: "code",
        data: {
          code: node.textContent?.trim() || "",
        },
      });
      continue;
    }

    if (tag === "hr") {
      blocks.push({ type: "delimiter", data: {} });
      continue;
    }

    if (tag === "table") {
      const rows = Array.from(node.querySelectorAll("tr")).map((row) =>
        Array.from(row.children).map((cell) => (cell as HTMLElement).innerHTML.trim())
      );
      if (rows.length > 0) {
        const firstRow = node.querySelector("tr");
        const withHeadings = Array.from(firstRow?.children || []).some(
          (cell) => cell.tagName.toLowerCase() === "th"
        );
        blocks.push({
          type: "table",
          data: {
            withHeadings,
            content: rows,
          },
        });
      }
      continue;
    }

    if (tag === "figure") {
      const image = node.querySelector("img");
      if (image?.getAttribute("src")) {
        blocks.push({
          type: "image",
          data: {
            file: { url: image.getAttribute("src") || "" },
            caption: node.querySelector("figcaption")?.innerHTML?.trim() || "",
            withBorder: false,
            stretched: false,
            withBackground: false,
          },
        });
        continue;
      }

      const iframe = node.querySelector("iframe");
      if (iframe?.getAttribute("src")) {
        const details = getEmbedDetails(iframe.getAttribute("src") || "");
        if (details) {
          blocks.push({
            type: "embed",
            data: {
              ...details,
              caption: node.querySelector("figcaption")?.textContent?.trim() || "",
            },
          });
        }
        continue;
      }
    }

    if (tag === "iframe" || tag === "video") {
      const details = getEmbedDetails(node.getAttribute("src") || "");
      if (details) {
        blocks.push({ type: "embed", data: details });
      }
      continue;
    }

    const outerHtml = (node as HTMLElement).outerHTML?.trim();
    if (outerHtml) {
      blocks.push({
        type: "raw",
        data: {
          html: outerHtml,
        },
      });
    }
  }

  if (blocks.length === 0) {
    const plain = document.body.textContent?.trim();
    if (plain) {
      blocks.push({
        type: "paragraph",
        data: {
          text: escapeHtml(plain).replace(/\n/g, "<br>"),
        },
      });
    } else {
      blocks.push({
        type: "raw",
        data: {
          html: html.trim(),
        },
      });
    }
  }

  return normalizeOutput({
    time: Date.now(),
    version: DEFAULT_EDITOR_VERSION,
    blocks: blocks as OutputData["blocks"],
  });
};

export const createImageUploader = () => ({
  uploadByFile: (file: File) =>
    new Promise<{ success: 1; file: { url: string } }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        if (!result) {
          reject(new Error("Unable to read image file"));
          return;
        }

        resolve({
          success: 1,
          file: { url: result },
        });
      };
      reader.onerror = () => reject(new Error("Unable to read image file"));
      reader.readAsDataURL(file);
    }),
  uploadByUrl: async (url: string) => ({
    success: 1 as const,
    file: { url },
  }),
});
