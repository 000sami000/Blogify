import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

const USER_AGENT =
  "Mozilla/5.0 (compatible; BlogifyBot/1.0; +https://localhost)";
const REQUEST_TIMEOUT_MS = 8000;

const parseMetaContent = (html: string, key: string) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=['\"]${escaped}['\"][^>]+content=['\"]([^'\"]*)['\"][^>]*>`,
    "i"
  );
  return html.match(regex)?.[1]?.trim() || "";
};

const parseTitle = (html: string) => html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";

const isBlockedIp = (host: string) => {
  const ipType = isIP(host);
  if (!ipType) {
    return false;
  }

  if (ipType === 6) {
    const lower = host.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
  }

  if (host.startsWith("127.")) {
    return true;
  }

  if (host.startsWith("10.")) {
    return true;
  }

  if (host.startsWith("192.168.")) {
    return true;
  }

  const parts = host.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  return false;
};

const isBlockedHost = (host: string) => {
  const lower = host.toLowerCase();

  if (!lower) {
    return true;
  }

  if (lower === "localhost" || lower.endsWith(".local")) {
    return true;
  }

  return isBlockedIp(lower);
};

const getRequestedUrl = async (request: NextRequest) => {
  if (request.method === "GET") {
    return request.nextUrl.searchParams.get("url") || "";
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const value = body.url || body.link;
  return typeof value === "string" ? value : "";
};

const buildPreview = (html: string, targetUrl: string) => {
  const title =
    parseMetaContent(html, "og:title") ||
    parseMetaContent(html, "twitter:title") ||
    parseTitle(html) ||
    targetUrl;

  const description =
    parseMetaContent(html, "og:description") ||
    parseMetaContent(html, "description") ||
    parseMetaContent(html, "twitter:description") ||
    "";

  const imageUrl =
    parseMetaContent(html, "og:image") ||
    parseMetaContent(html, "twitter:image") ||
    "";

  const siteName = parseMetaContent(html, "og:site_name") || "";

  return {
    title,
    description,
    ...(siteName ? { site_name: siteName } : {}),
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
  };
};

const handleRequest = async (request: NextRequest) => {
  const requestedUrl = (await getRequestedUrl(request)).trim();

  if (!requestedUrl) {
    return NextResponse.json({ success: 0, error: "Missing url" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(requestedUrl);
  } catch {
    return NextResponse.json({ success: 0, error: "Invalid url" }, { status: 400 });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ success: 0, error: "Unsupported protocol" }, { status: 400 });
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    return NextResponse.json({ success: 0, error: "Blocked host" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ success: 0, error: "Failed to fetch url" }, { status: 502 });
    }

    const html = await response.text();
    const meta = buildPreview(html, parsedUrl.toString());

    return NextResponse.json({
      success: 1,
      link: parsedUrl.toString(),
      meta,
    });
  } catch {
    return NextResponse.json({ success: 0, error: "Unable to read url metadata" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
};

export const GET = handleRequest;
export const POST = handleRequest;
