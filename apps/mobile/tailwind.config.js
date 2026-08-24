/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#08090b",
        surface: "#111318",
        "surface-bright": "#181b21",
        primary: "#f4f2ee",
        "primary-dim": "rgba(244, 242, 238, 0.12)",
        accent: "#c89b6d",
        textMain: "#f4f2ee",
        textMuted: "#b8b5b0",
        error: "#ff7087",
        success: "#4ec98b",
        warning: "#e7b86a",
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
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
