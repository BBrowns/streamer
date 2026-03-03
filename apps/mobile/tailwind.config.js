/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0a0a1a",
        surface: "#1a1a3e",
        "surface-bright": "#252552",
        primary: "#818cf8",
        "primary-dim": "rgba(129, 140, 248, 0.15)",
        accent: "#a78bfa",
        textMain: "#e0e0ff",
        textMuted: "#9ca3af",
        error: "#f87171",
        success: "#34d399",
        warning: "#f59e0b",
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "24px",
      },
      screens: {
        tablet: "768px",
        desktop: "1280px",
        wide: "1920px",
      },
      spacing: {
        18: "4.5rem",
        88: "22rem",
      },
    },
  },
  plugins: [],
};
