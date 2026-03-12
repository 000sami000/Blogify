export const formatCompactCount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0";
  }

  const safe = Math.max(0, parsed);
  if (safe < 1000) {
    return String(Math.trunc(safe));
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(safe);
};

