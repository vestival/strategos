import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#DBEAFE",
          100: "#BFDBFE",
          500: "#1D4ED8",
          700: "#1E40AF",
          900: "#1E3A8A"
        }
      }
    }
  },
  plugins: []
};

export default config;
