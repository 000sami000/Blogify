"use client";

import { cn } from "@/lib/utils";
import type EditorJS from "@editorjs/editorjs";
import React, { memo, useEffect, useId, useMemo, useRef } from "react";
import { contentToEditorData } from "./utils";
import type { OutputData } from "@editorjs/editorjs";

interface BlockReaderProps {
  content: unknown;
  className?: string;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 64);

const applyTocAnchors = (holder: HTMLElement) => {
  const headings = Array.from(
    holder.querySelectorAll(
      "h2, h3, .ce-header[data-level='2'], .ce-header[data-level='3']"
    )
  );
  const usedIds = new Set<string>();

  headings.forEach((heading, index) => {
    const label =
      heading.textContent?.replace(/\s+/g, " ").trim() || `section-${index + 1}`;
    const base = slugify(label) || `section-${index + 1}`;
    let id = base;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);
    heading.setAttribute("id", id);
    heading.classList.add("toc-anchor");
  });
};

const renderEditorDocument = async (editor: EditorJS, data: OutputData) => {
  if (typeof editor.render !== "function") {
    return;
  }
  await editor.render(data);
};

const lockEditableNodes = (holder: HTMLElement) => {
  holder
    .querySelectorAll<HTMLElement>('[contenteditable="true"]')
    .forEach((node) => {
      node.setAttribute("contenteditable", "false");
    });
};

const BlockReader = ({ content, className }: BlockReaderProps) => {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorJS | null>(null);
  const isEditorReadyRef = useRef(false);
  const forceLockedModeRef = useRef(false);
  const documentRef = useRef<OutputData>(contentToEditorData(content));
  const reactId = useId();
  const holderId = useMemo(
    () => `block-reader-${reactId.replace(/[:]/g, "")}`,
    [reactId]
  );
  const documentData = useMemo<OutputData>(
    () => contentToEditorData(content),
    [content]
  );

  useEffect(() => {
    documentRef.current = documentData;
    const editor = editorRef.current;
    if (!editor || !isEditorReadyRef.current) {
      return;
    }

    void (async () => {
      try {
        await renderEditorDocument(editor, documentData);
        if (holderRef.current) {
          if (forceLockedModeRef.current) {
            lockEditableNodes(holderRef.current);
          }
          applyTocAnchors(holderRef.current);
        }
      } catch (error) {
        console.error("Failed to render read-only EditorJS content", error);
      }
    })();
  }, [documentData]);

  useEffect(() => {
    let cancelled = false;

    const initEditor = async () => {
      if (!holderRef.current) {
        setTimeout(() => {
          if (!cancelled && !editorRef.current) {
            void initEditor();
          }
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
          { default: LinkTool },
          { default: ImageTool },
          { default: Embed },
          { default: Table },
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
          import("@editorjs/link"),
          import("@editorjs/image"),
          import("@editorjs/embed"),
          import("@editorjs/table"),
          import("@editorjs/warning"),
          import("@editorjs/raw"),
        ]);

        if (cancelled || !holderRef.current) {
          return;
        }

        const buildEditor = (readOnlyMode: boolean) =>
          new EditorJSModule({
            holder: holderRef.current as HTMLDivElement,
            data: documentRef.current,
            readOnly: readOnlyMode,
            autofocus: false,
            inlineToolbar: false,
            minHeight: 0,
            tools: {
              header: {
                class: Header as unknown as never,
                config: {
                  levels: [1, 2, 3, 4, 5, 6],
                  defaultLevel: 2,
                },
              },
              list: {
                class: List as unknown as never,
                config: { defaultStyle: "unordered" },
              },
              checklist: {
                class: Checklist as unknown as never,
              },
              quote: {
                class: Quote as unknown as never,
                config: {
                  quotePlaceholder: "Quote",
                  captionPlaceholder: "Author",
                },
              },
              warning: {
                class: Warning as unknown as never,
                config: {
                  titlePlaceholder: "Title",
                  messagePlaceholder: "Message",
                },
              },
              image: {
                class: ImageTool as unknown as never,
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
              table: {
                class: Table as unknown as never,
                config: { rows: 2, cols: 2, withHeadings: true },
              },
              code: CodeTool as unknown as never,
              raw: Raw as unknown as never,
              delimiter: Delimiter as unknown as never,
              linkTool: {
                class: LinkTool as unknown as never,
                config: { endpoint: "/api/editorjs/link" },
              },
            },
            onReady: async () => {
              isEditorReadyRef.current = true;
              if (holderRef.current) {
                if (!readOnlyMode || forceLockedModeRef.current) {
                  lockEditableNodes(holderRef.current);
                }
                applyTocAnchors(holderRef.current);
              }
            },
          });

        let editor: EditorJS;
        try {
          editor = buildEditor(true);
          await editor.isReady;
        } catch (readOnlyError) {
          console.warn(
            "Read-only EditorJS failed, falling back to locked view mode",
            readOnlyError
          );
          forceLockedModeRef.current = true;
          editor = buildEditor(false);
          await editor.isReady;
          if (holderRef.current) {
            lockEditableNodes(holderRef.current);
          }
        }

        if (cancelled) {
          editor.destroy();
          return;
        }

        editorRef.current = editor;
        isEditorReadyRef.current = true;
        await renderEditorDocument(editor, documentRef.current);
        if (holderRef.current) {
          if (forceLockedModeRef.current) {
            lockEditableNodes(holderRef.current);
          }
          applyTocAnchors(holderRef.current);
        }
      } catch (error) {
        console.error("Failed to initialize read-only EditorJS", error);
      }
    };

    void initEditor();

    return () => {
      cancelled = true;
      isEditorReadyRef.current = false;
      forceLockedModeRef.current = false;
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []);

  return (
    <div className={cn("w-full", className)}>
      <style>{`
        #${holderId} .codex-editor {
          width: 100%;
        }

        #${holderId} .ce-toolbar,
        #${holderId} .ce-inline-toolbar,
        #${holderId} .ce-conversion-toolbar,
        #${holderId} .ce-settings {
          display: none !important;
        }

        #${holderId} .ce-block__content,
        #${holderId} .ce-toolbar__content {
          max-width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        #${holderId} .codex-editor__redactor {
          padding-bottom: 0 !important;
        }

        #${holderId} h1,
        #${holderId} h2,
        #${holderId} h3,
        #${holderId} h4,
        #${holderId} h5,
        #${holderId} h6 {
          color: rgb(var(--ft-text));
          font-family: var(--font-display), "Segoe UI", sans-serif;
          font-weight: 600;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        #${holderId} h1 { font-size: 2.05rem; margin-top: 2rem; }
        #${holderId} h2 { font-size: 1.7rem; margin-top: 1.7rem; }
        #${holderId} h3 { font-size: 1.42rem; margin-top: 1.45rem; }
        #${holderId} h4 { font-size: 1.24rem; margin-top: 1.2rem; }
        #${holderId} h5 { font-size: 1.1rem; margin-top: 1rem; }
        #${holderId} h6 { font-size: 1rem; margin-top: 1rem; }

        #${holderId} p {
          color: rgb(var(--ft-muted));
          line-height: 1.75;
        }

        #${holderId} ul,
        #${holderId} ol {
          color: rgb(var(--ft-muted));
          padding-left: 1.45rem;
        }

        #${holderId} ul { list-style: disc; }
        #${holderId} ol { list-style: decimal; }

        #${holderId} li + li {
          margin-top: 0.35rem;
        }
      `}</style>
      <div id={holderId} ref={holderRef} className="w-full" />
    </div>
  );
};

export default memo(BlockReader);
