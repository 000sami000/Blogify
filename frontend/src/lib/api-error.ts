import axios from "axios";

const readStringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong"
) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;

    const plainText = readStringValue(data);
    if (plainText) {
      return plainText;
    }

    if (data && typeof data === "object") {
      const payload = data as {
        message?: unknown;
        error?: unknown;
        details?: unknown;
        errors?: unknown;
      };

      const directMessage =
        readStringValue(payload.message) ??
        readStringValue(payload.error) ??
        readStringValue(payload.details);

      if (directMessage) {
        return directMessage;
      }

      if (Array.isArray(payload.errors)) {
        const errorItems = payload.errors
          .map((item) => {
            if (typeof item === "string") {
              return item.trim();
            }
            if (item && typeof item === "object") {
              const mapped = item as { msg?: unknown; message?: unknown };
              return readStringValue(mapped.message) ?? readStringValue(mapped.msg);
            }
            return null;
          })
          .filter((item): item is string => Boolean(item));

        if (errorItems.length) {
          return errorItems.join(", ");
        }
      }
    }

    const axiosMessage = readStringValue(error.message);
    if (axiosMessage) {
      return axiosMessage;
    }

    if (error.response?.status) {
      return `${fallback} (HTTP ${error.response.status})`;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
};
