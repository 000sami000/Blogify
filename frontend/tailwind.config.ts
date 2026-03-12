import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ft: {
          bg: "rgb(var(--ft-bg) / <alpha-value>)",
          panel: "rgb(var(--ft-panel) / <alpha-value>)",
          card: "rgb(var(--ft-card) / <alpha-value>)",
          border: "rgb(var(--ft-border) / <alpha-value>)",
          text: "rgb(var(--ft-text) / <alpha-value>)",
          muted: "rgb(var(--ft-muted) / <alpha-value>)",
          accent: "rgb(var(--ft-accent) / <alpha-value>)",
          sky: "rgb(var(--ft-sky) / <alpha-value>)",
        },
      },
      boxShadow: {
        "ft-soft": "0 14px 36px rgba(0, 0, 0, 0.35)",
      },
      borderRadius: {
        "2xl-plus": "1.25rem",
      },
    },
  },
};

export default config;
