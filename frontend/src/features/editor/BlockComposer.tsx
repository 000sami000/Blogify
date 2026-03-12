"use client";

import { cn } from "@/lib/utils";
import type EditorJS from "@editorjs/editorjs";
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { BlockComposerChangePayload } from "./types";
import {
  contentToEditorData,
  createImageUploader,
  outputToPayload,
} from "./utils";
import type { OutputData } from "@editorjs/editorjs";
import { BackgroundColorInlineTool, TextColorInlineTool } from "./inlineColorTools";

export interface BlockComposerHandle {
  setFromHtml: (html: string) => void;
  getHtml: () => string;
}

interface BlockComposerProps {
  initialHtml?: string;
  onChange?: (payload: BlockComposerChangePayload) => void;
  className?: string;
}

const SAVE_DEBOUNCE_MS = 220;
const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;
const JSON_LIKE_PATTERN = /^[\s]*[\[{"]/;
const toPlainText = (value: string) =>
  value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

type EditorLike = {
  save?: () => Promise<OutputData>;
  render?: (data: OutputData) => Promise<void> | void;
  saver?: { save?: () => Promise<OutputData> };
  blocks?: {
    clear?: () => Promise<void> | void;
    renderFromHTML?: (value: string) => Promise<void> | void;
  };
};

const canSaveEditor = (editor: unknown): editor is EditorLike =>
  Boolean(
    editor &&
      typeof editor === "object" &&
      (typeof (editor as EditorLike).save === "function" ||
        typeof (editor as EditorLike).saver?.save === "function")
  );

const canRenderEditor = (editor: unknown): editor is EditorLike =>
  Boolean(
    editor &&
      typeof editor === "object" &&
      typeof (editor as EditorLike).render === "function"
  );

const saveFromEditor = async (editor: EditorLike): Promise<OutputData> => {
  if (typeof editor.save === "function") return editor.save();
  if (typeof editor.saver?.save === "function") return editor.saver.save();
  throw new Error("Editor save API is unavailable");
};

// Stable unique ID so the <style> selector always matches the holder div
const HOLDER_ID = "block-composer-holder";

const BlockComposer = forwardRef<BlockComposerHandle, BlockComposerProps>(
  ({ initialHtml = "", onChange, className }, ref) => {
    const holderRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<EditorJS | null>(null);
    const onChangeRef = useRef(onChange);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingHtmlRef = useRef(initialHtml);
    const latestHtmlRef = useRef(initialHtml);
    const lastAppliedInitialRef = useRef<string | null>(null);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    const saveAndEmit = useCallback(async (editor: EditorJS) => {
      try {
        if (!canSaveEditor(editor)) return null;
        const output = await saveFromEditor(editor);
        const payload = outputToPayload(output);
        latestHtmlRef.current = payload.html;
        onChangeRef.current?.(payload);
        return payload;
      } catch (error) {
        console.error("EditorJS save error", error);
        return null;
      }
    }, []);

    const tryRenderFromHtmlApi = useCallback(
      async (editor: EditorJS, html: string) => {
        const api = editor as unknown as EditorLike;
        if (!api.blocks?.renderFromHTML) return false;
        if (api.blocks.clear) await api.blocks.clear();
        await api.blocks.renderFromHTML(html);
        return true;
      },
      []
    );

    const applyHtml = useCallback(
      async (html: string) => {
        pendingHtmlRef.current = html;
        latestHtmlRef.current = html;
        const editor = editorRef.current;
        if (!editor) return;

        try {
          const trimmed = String(html ?? "").trim();
          const looksLikeSerializedJson = JSON_LIKE_PATTERN.test(trimmed);
          const renderedFromHtml =
            !looksLikeSerializedJson &&
            trimmed.length > 0 &&
            HTML_TAG_PATTERN.test(trimmed)
              ? await tryRenderFromHtmlApi(editor, html)
              : false;

          if (!renderedFromHtml && canRenderEditor(editor)) {
            await editor.render(contentToEditorData(html));
          }

          const payload = await saveAndEmit(editor);
          if (
            trimmed.length > 0 &&
            (!payload?.plainText || !payload.plainText.trim())
          ) {
            const fallbackText = toPlainText(trimmed);
            if (fallbackText && canRenderEditor(editor)) {
              await editor.render({
                time: Date.now(),
                version: "2.31.4",
                blocks: [{ type: "paragraph", data: { text: fallbackText } }],
              });
              await saveAndEmit(editor);
            }
          }
        } catch (error) {
          console.error("EditorJS render error", error);
          try {
            if (canRenderEditor(editor)) {
              await editor.render(contentToEditorData(html));
              await saveAndEmit(editor);
            }
          } catch (fallbackError) {
            console.error("EditorJS fallback render error", fallbackError);
          }
        }
      },
      [saveAndEmit, tryRenderFromHtmlApi]
    );

    useImperativeHandle(
      ref,
      () => ({
        setFromHtml: (html: string) => void applyHtml(html),
        getHtml: () => latestHtmlRef.current,
      }),
      [applyHtml]
    );

    useEffect(() => {
      if (lastAppliedInitialRef.current === initialHtml) return;
      lastAppliedInitialRef.current = initialHtml;
      void applyHtml(initialHtml);
    }, [initialHtml, applyHtml]);

    useEffect(() => {
      let cancelled = false;

      const initEditor = async () => {
        if (cancelled || editorRef.current) return;

        if (!holderRef.current) {
          setTimeout(() => {
            if (!cancelled && !editorRef.current) void initEditor();
          }, 0);
          return;
        }

        try {
          const [
            { default: EditorJSModule },
            { default: Header },
            { default: List },
            { default: Checklist },
            { default: Quote },
            { default: CodeTool },
            { default: Delimiter },
            { default: InlineCode },
            { default: LinkTool },
            { default: ImageTool },
            { default: Embed },
            { default: Table },
            { default: Marker },
            { default: Warning },
            { default: Raw },
          ] = await Promise.all([
            import("@editorjs/editorjs"),
            import("@editorjs/header"),
            import("@editorjs/list"),
            import("@editorjs/checklist"),
            import("@editorjs/quote"),
            import("@editorjs/code"),
            import("@editorjs/delimiter"),
            import("@editorjs/inline-code"),
            import("@editorjs/link"),
            import("@editorjs/image"),
            import("@editorjs/embed"),
            import("@editorjs/table"),
            import("@editorjs/marker"),
            import("@editorjs/warning"),
            import("@editorjs/raw"),
          ]);

          if (cancelled || !holderRef.current) return;

          const editor = new EditorJSModule({
            holder: holderRef.current,
            autofocus: false,
            /**
             * HEADING FIX — two things are required:
             *
             * 1. The tool key MUST be "header". EditorJS serialises blocks
             *    with  { type: "header", data: { text, level } }. If you use
             *    any other key the saved JSON will have the wrong type and
             *    re-rendering will silently fall back to a paragraph.
             *
             * 2. The Header plugin exposes level switching via a "tunes"
             *    panel (the ⋮ menu on the block). You do NOT need separate
             *    tool registrations per level — one "header" entry with
             *    levels: [1,2,3,4,5,6] is the correct approach.
             */
            inlineToolbar: [
              "bold",
              "italic",
              "link",
              "inlineCode",
              "marker",
              "textColor",
              "backgroundColor",
            ],
            placeholder: "Write your blog…",
            data: contentToEditorData(pendingHtmlRef.current),
            tools: {
              // ── Heading ────────────────────────────────────────────────────
              header: {
                class: Header as unknown as never,
                inlineToolbar: true,
                config: {
                  placeholder: "Heading…",
                  levels: [1, 2, 3, 4, 5, 6],
                  defaultLevel: 2,
                },
              },

              // ── Lists ──────────────────────────────────────────────────────
              list: {
                class: List as unknown as never,
                inlineToolbar: true,
                config: { defaultStyle: "unordered" },
              },
              checklist: {
                class: Checklist as unknown as never,
                inlineToolbar: true,
              },

              // ── Quote / Warning ────────────────────────────────────────────
              quote: {
                class: Quote as unknown as never,
                inlineToolbar: true,
                config: {
                  quotePlaceholder: "Quote",
                  captionPlaceholder: "Author",
                },
              },
              warning: {
                class: Warning as unknown as never,
                inlineToolbar: true,
                config: {
                  titlePlaceholder: "Title",
                  messagePlaceholder: "Message",
                },
              },

              // ── Media ──────────────────────────────────────────────────────
              image: {
                class: ImageTool as unknown as never,
                config: { uploader: createImageUploader() },
              },
              embed: {
                class: Embed as unknown as never,
                config: {
                  services: {
                    youtube: true,
                    vimeo: true,
                    codepen: true,
                    instagram: true,
                    twitter: true,
                    coub: true,
                    twitch: true,
                    pinterest: true,
                    github: true,
                  },
                },
              },

              // ── Table ──────────────────────────────────────────────────────
              table: {
                class: Table as unknown as never,
                inlineToolbar: true,
                config: { rows: 2, cols: 2, withHeadings: true },
              },

              // ── Code ───────────────────────────────────────────────────────
              code: CodeTool as unknown as never,
              inlineCode: {
                class: InlineCode as unknown as never,
                shortcut: "CMD+SHIFT+M",
              },
              raw: Raw as unknown as never,
              delimiter: Delimiter as unknown as never,

              // ── Link preview ───────────────────────────────────────────────
              linkTool: {
                class: LinkTool as unknown as never,
                config: { endpoint: "/api/editorjs/link" },
              },

              // ── Inline colour tools ────────────────────────────────────────
              marker: {
                class: Marker as unknown as never,
                shortcut: "CMD+SHIFT+H",
              },
              textColor: {
                class: TextColorInlineTool as unknown as never,
                config: { defaultColor: "#2563eb" },
              },
              backgroundColor: {
                class: BackgroundColorInlineTool as unknown as never,
                config: { defaultColor: "#fde68a" },
              },
            },

            onReady: () => {
              editorRef.current = editor;
              void applyHtml(pendingHtmlRef.current);
            },
            onChange: () => {
              if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
              saveTimerRef.current = setTimeout(() => {
                if (editorRef.current) void saveAndEmit(editorRef.current);
              }, SAVE_DEBOUNCE_MS);
            },
          });

          await editor.isReady;
          if (cancelled) { editor.destroy(); return; }
          editorRef.current = editor;
        } catch (error) {
          console.error("Failed to initialize EditorJS", error);
        }
      };

      void initEditor();

      return () => {
        cancelled = true;
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        const editor = editorRef.current;
        editorRef.current = null;
        if (editor) editor.destroy();
      };
    }, [applyHtml, saveAndEmit]);

    return (
      <div
        className={cn(
          "relative w-full rounded-2xl border border-border bg-card shadow-sm",
          className
        )}
      >
        {/*
         * WIDTH FIX
         * EditorJS injects its own stylesheet that caps content columns at
         * 650 px via:
         *   .ce-block__content   { max-width: 650px; margin: 0 auto; }
         *   .ce-toolbar__content { max-width: 650px; margin: 0 auto; }
         *
         * We scope the overrides to our holder ID so they don't affect any
         * other EditorJS instances on the page. The !important is required
         * because EditorJS loads its sheet after ours.
         *
         * HEADING FIX
         * Browsers reset h1-h6 font sizes inside contenteditable divs.
         * We restore sensible sizes so Heading 1 looks different from
         * Heading 3 inside the editor canvas.
         */}
        <style>{`
          #${HOLDER_ID} .codex-editor { width: 100%; }

          #${HOLDER_ID} .ce-block__content,
          #${HOLDER_ID} .ce-toolbar__content {
            max-width: 100% !important;
            margin-left: 0    !important;
            margin-right: 0   !important;
            padding-left: 20px;
            padding-right: 20px;
          }

          #${HOLDER_ID} .codex-editor__redactor {
            padding-bottom: 80px !important;
          }

          /* Restore heading sizes inside the editor */
          #${HOLDER_ID} .ce-block h1 { font-size: 2.25rem;  font-weight: 800; line-height: 1.15; }
          #${HOLDER_ID} .ce-block h2 { font-size: 1.75rem;  font-weight: 700; line-height: 1.2;  }
          #${HOLDER_ID} .ce-block h3 { font-size: 1.375rem; font-weight: 700; line-height: 1.3;  }
          #${HOLDER_ID} .ce-block h4 { font-size: 1.125rem; font-weight: 600; line-height: 1.35; }
          #${HOLDER_ID} .ce-block h5 { font-size: 1rem;     font-weight: 600; line-height: 1.4;  }
          #${HOLDER_ID} .ce-block h6 { font-size: 0.875rem; font-weight: 600; line-height: 1.4; color: #6b7280; }

          #${HOLDER_ID} .ce-block [contenteditable]:focus { outline: none; }
        `}</style>

        <div
          id={HOLDER_ID}
          ref={holderRef}
          className="w-full min-h-[360px] py-4"
        />
      </div>
    );
  }
);

BlockComposer.displayName = "BlockComposer";

export default memo(BlockComposer);