import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#141414",
        paper: "#fbfaf7",
        moss: "#5c6f59",
        clay: "#b76e4c",
        steel: "#496a81",
      },
    },
  },
  plugins: [],
};

export default config;
