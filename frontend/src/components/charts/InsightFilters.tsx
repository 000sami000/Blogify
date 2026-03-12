"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import React from "react";

export type InsightGranularity = "day" | "month" | "year";

export interface InsightFilterValue {
  granularity: InsightGranularity;
  month: string;
  from: string;
  to: string;
}

interface InsightFiltersProps {
  value: InsightFilterValue;
  onChange: (value: InsightFilterValue) => void;
  onApply: () => void;
  applyLabel?: string;
  disabled?: boolean;
  defaultGranularity?: InsightGranularity;
}

export const buildInsightParams = (filter: InsightFilterValue) => {
  const params: Record<string, string> = {
    granularity: filter.granularity,
  };

  if (filter.from && filter.to) {
    params.from = filter.from;
    params.to = filter.to;
    return params;
  }

  if (filter.month) {
    params.month = filter.month;
  }

  return params;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const getMonthRange = (month: string) => {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { from: "", to: "" };
  }

  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return { from: "", to: "" };
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));

  const from = `${start.getUTCFullYear()}-${pad2(start.getUTCMonth() + 1)}-${pad2(start.getUTCDate())}`;
  const to = `${end.getUTCFullYear()}-${pad2(end.getUTCMonth() + 1)}-${pad2(end.getUTCDate())}`;

  return { from, to };
};

const InsightFilters = ({
  value,
  onChange,
  onApply,
  applyLabel = "Apply",
  disabled = false,
  defaultGranularity = "month",
}: InsightFiltersProps) => {
  const ordered: InsightGranularity[] = ["day", "month", "year"];
  const granularityOptions: InsightGranularity[] = [
    defaultGranularity,
    ...ordered.filter((item) => item !== defaultGranularity),
  ];

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-full border border-border bg-background p-1">
        {granularityOptions.map((item) => {
          const isActive = value.granularity === item;
          return (
            <button
              key={item}
              type="button"
              className={`panze-pill px-3 ${isActive ? "panze-pill-active" : ""}`}
              onClick={() =>
                onChange({
                  ...value,
                  granularity: item,
                })
              }
            >
              By {item}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
        <Input
          type="month"
          className="premium-input"
          value={value.month}
          onChange={(e) => {
            const nextMonth = e.target.value;
            const range = getMonthRange(nextMonth);
            onChange({
              ...value,
              month: nextMonth,
              from: range.from,
              to: range.to,
            });
          }}
        />
        <Input
          type="date"
          className="premium-input"
          value={value.from}
          onChange={(e) =>
            onChange({
              ...value,
              from: e.target.value,
            })
          }
        />
        <Input
          type="date"
          className="premium-input"
          value={value.to}
          onChange={(e) =>
            onChange({
              ...value,
              to: e.target.value,
            })
          }
        />
        <Button onClick={onApply} disabled={disabled} className="h-10 rounded-xl px-5">
          {applyLabel}
        </Button>
      </div>
    </div>
  );
};

export default InsightFilters;
