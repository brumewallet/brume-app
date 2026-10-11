import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#F2F1F8",
          100: "#E5E2F0",
          200: "#C7C1E0",
          300: "#A099C8",
          400: "#6C6597",
          500: "#423878",
          600: "#322663",
          700: "#2B1F6B",
          800: "#271B69",
          900: "#191243",
          950: "#0D0925",
          DEFAULT: "#271B69",
        },
        ube: {
          50: "#F7F5FF",
          100: "#EFEBFE",
          200: "#E0DAFE",
          300: "#CCC4FD",
          400: "#AFA2FC",
          500: "#9A86F6",
          600: "#7E66EC",
          DEFAULT: "#AFA2FC",
        },
        ink: "#191243",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.75rem",
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      boxShadow: {
        glass:
          "0 1px 0 0 rgba(255,255,255,0.9) inset, 0 24px 60px -26px rgba(13,9,37,0.28), 0 6px 18px -10px rgba(13,9,37,0.16)",
        "glass-lift":
          "0 1px 0 0 rgba(255,255,255,0.95) inset, 0 40px 90px -34px rgba(13,9,37,0.32), 0 10px 28px -16px rgba(13,9,37,0.18)",
        primary: "0 14px 34px -14px rgba(39,27,105,0.55)",
        accent: "0 14px 36px -14px rgba(175,162,252,0.55)",
      },
      backgroundImage: {
        "brume-mesh":
          "radial-gradient(60% 55% at 16% 6%, rgba(255,255,255,0.95) 0%, transparent 60%)," +
          "radial-gradient(52% 48% at 86% 0%, rgba(175,162,252,0.32) 0%, transparent 58%)," +
          "radial-gradient(55% 52% at 92% 90%, rgba(204,196,253,0.30) 0%, transparent 60%)," +
          "radial-gradient(60% 58% at 6% 100%, rgba(39,27,105,0.10) 0%, transparent 62%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        drift: {
          "0%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(2%,-2.5%,0) scale(1.06)" },
          "100%": { transform: "translate3d(0,0,0) scale(1)" },
        },
        "drift-slow": {
          "0%": { transform: "translate3d(0,0,0) scale(1.05)" },
          "50%": { transform: "translate3d(-3%,2%,0) scale(1)" },
          "100%": { transform: "translate3d(0,0,0) scale(1.05)" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        drift: "drift 24s ease-in-out infinite",
        "drift-slow": "drift-slow 32s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
