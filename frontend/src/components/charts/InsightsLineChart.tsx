"use client";

import {
  BarElement,
  CategoryScale,
  ChartOptions,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TooltipItem,
  Tooltip,
} from "chart.js";
import React, { memo, useMemo } from "react";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

export interface InsightPoint {
  bucket: string;
  count: number;
}

interface InsightsLineChartProps {
  title: string;
  data: InsightPoint[];
  color?: string;
  heightClassName?: string;
  chartType?: "line" | "bar";
}

const formatLabel = (bucket: string) => {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) {
    return bucket;
  }
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

const toRgba = (hexColor: string, opacity: number) => {
  const normalized = hexColor.replace("#", "");
  const isValidHex = /^[0-9a-fA-F]{6}$/.test(normalized);

  if (!isValidHex) {
    return hexColor;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const compactNumber = (value: number) => {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `${value}`;
};

const InsightsLineChart = ({
  title,
  data,
  color = "#0f172a",
  heightClassName = "h-72",
  chartType = "line",
}: InsightsLineChartProps) => {
  const labels = useMemo(() => data.map((item) => formatLabel(item.bucket)), [data]);
  const values = useMemo(() => data.map((item) => item.count), [data]);

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: title,
          data: values,
          borderColor: color,
          backgroundColor: (context: { chart: ChartJS }) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;

            if (!chartArea) {
              return toRgba(color, 0.22);
            }

            const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, toRgba(color, 0.36));
            gradient.addColorStop(1, toRgba(color, 0.02));
            return gradient;
          },
          borderWidth: 2.5,
          fill: true,
          tension: 0.38,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 2,
          pointHoverBackgroundColor: "#ffffff",
          pointHoverBorderColor: color,
        },
      ],
    }),
    [labels, title, color, values]
  );

  const barChartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: title,
          data: values,
          borderRadius: 10,
          borderSkipped: false,
          maxBarThickness: 30,
          backgroundColor: (context: { chart: ChartJS }) => {
            const chart = context.chart;
            const { ctx, chartArea } = chart;

            if (!chartArea) {
              return toRgba(color, 0.75);
            }

            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, toRgba(color, 0.45));
            gradient.addColorStop(0.45, toRgba(color, 0.65));
            gradient.addColorStop(1, toRgba(color, 0.95));
            return gradient;
          },
          hoverBackgroundColor: toRgba(color, 1),
        },
      ],
    }),
    [labels, title, color, values]
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index" as const,
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "rgba(148, 163, 184, 0.35)",
          borderWidth: 1,
          titleColor: "#f8fafc",
          bodyColor: "#e2e8f0",
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (context: TooltipItem<"line">) =>
              `${title}: ${compactNumber(Number(context.parsed.y ?? 0))}`,
          },
        },
      },
      animation: {
        duration: 650,
        easing: "easeOutQuart",
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#748299",
            maxTicksLimit: 8,
            font: {
              size: 11,
              weight: 500,
            },
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(188, 202, 220, 0.55)",
            borderDash: [4, 4],
          },
          ticks: {
            color: "#748299",
            precision: 0,
            callback: (value: string | number) => compactNumber(Number(value)),
            font: {
              size: 11,
              weight: 500,
            },
          },
        },
      },
    }),
    [title]
  );

  const barOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 760,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "rgba(148, 163, 184, 0.35)",
          borderWidth: 1,
          titleColor: "#f8fafc",
          bodyColor: "#e2e8f0",
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (context: TooltipItem<"bar">) =>
              `${title}: ${compactNumber(Number(context.parsed.y ?? 0))}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#748299",
            maxTicksLimit: 8,
            font: {
              size: 11,
              weight: 500,
            },
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "rgba(188, 202, 220, 0.5)",
            borderDash: [5, 5],
          },
          ticks: {
            color: "#748299",
            precision: 0,
            callback: (value: string | number) => compactNumber(Number(value)),
            font: {
              size: 11,
              weight: 500,
            },
          },
        },
      },
    }),
    [title]
  );

  if (data.length === 0) {
    return (
      <div className={`${heightClassName} flex w-full items-center justify-center rounded-2xl border border-dashed border-border bg-card`}>
        <p className="text-sm text-muted-foreground">No insight data in selected range</p>
      </div>
    );
  }

  return (
    <div className={`${heightClassName} w-full`}>
      {chartType === "bar" ? (
        <Bar data={barChartData} options={barOptions} />
      ) : (
        <Line data={chartData} options={options} />
      )}
    </div>
  );
};

export default memo(InsightsLineChart);
