import { InsightPoint } from "@/components/charts/InsightsLineChart";
import { Blog } from "@/context/AppContext";

export const toSeries = (items: unknown): InsightPoint[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const bucket = String((item as { bucket?: unknown }).bucket ?? "").trim();
      const count = Number((item as { count?: unknown }).count ?? 0);

      if (!bucket) {
        return null;
      }

      return {
        bucket,
        count: Number.isFinite(count) ? count : 0,
      };
    })
    .filter((item): item is InsightPoint => Boolean(item));
};

export const mergeBlogsById = (current: Blog[], incoming: Blog[]) => {
  const map = new Map<string, Blog>();

  for (const item of current) {
    map.set(String(item.id), item);
  }

  for (const item of incoming) {
    map.set(String(item.id), item);
  }

  return Array.from(map.values());
};
