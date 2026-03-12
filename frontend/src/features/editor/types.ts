import type { OutputData } from "@editorjs/editorjs";

export interface TocItem {
  id: string;
  label: string;
  level: 2 | 3;
}

export interface BlockComposerChangePayload {
  html: string;
  plainText: string;
  toc: TocItem[];
  blocks: OutputData["blocks"];
  document: OutputData;
}
