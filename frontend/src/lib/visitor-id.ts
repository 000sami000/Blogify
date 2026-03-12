export const VISITOR_ID_COOKIE = "visitor_id";

const VISITOR_ID_PATTERN = /^v_[a-zA-Z0-9_-]{16,128}$/;

export const isValidVisitorId = (value: unknown): value is string =>
  typeof value === "string" && VISITOR_ID_PATTERN.test(value);

const fallbackRandom = () =>
  `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export const generateVisitorId = () => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `v_${globalThis.crypto.randomUUID().replace(/-/g, "")}`;
  }

  return `v_${fallbackRandom()}`;
};

