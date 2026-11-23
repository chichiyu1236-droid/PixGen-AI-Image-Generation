import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: "#f6f3ea",
          paper: "#fbf9f3",
          wash: "#eee9dc",
          warm: "#e7e1d1",
        },
        ink: {
          DEFAULT: "#171916",
          secondary: "#484e45",
          muted: "#6d7368",
          subtle: "#92978b",
        },
        oil: {
          sage: "#566c58",
          "sage-deep": "#384a3a",
          "sage-soft": "#e7eee5",
          ochre: "#b48a52",
          "ochre-soft": "#f4ead8",
          slate: "#596e7c",
          "slate-soft": "#e8eff2",
          blush: "#d6a99e",
        },
        paper: "#fbf9f3",
        moss: "#566c58",
        clay: "#b48a52",
        steel: "#596e7c",
      },
      fontFamily: {
        display: ["var(--font-display)", '"Noto Serif SC"', '"Times New Roman"', "serif"],
        sans: ["var(--font-body)", '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', "sans-serif"],
      },
      boxShadow: {
        "oil-soft": "0 18px 46px rgba(23, 25, 22, 0.06)",
        "oil-card": "0 24px 64px rgba(23, 25, 22, 0.08)",
        "oil-float": "0 28px 72px rgba(23, 25, 22, 0.13)",
      },
    },
  },
  plugins: [],
};

export default config;
