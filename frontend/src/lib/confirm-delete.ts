export const confirmBlogDelete = (blogTitle?: string) => {
  if (typeof window === "undefined") {
    return false;
  }

  const normalizedTitle = typeof blogTitle === "string" ? blogTitle.trim() : "";
  const target = normalizedTitle ? `"${normalizedTitle}"` : "this blog";

  return window.confirm(
    `Delete ${target} permanently?\nThis action cannot be undone.`
  );
};
