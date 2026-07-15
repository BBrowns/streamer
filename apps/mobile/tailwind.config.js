/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#08090c",
        surface: "#111318",
        "surface-bright": "#181b21",
        primary: "#f4f5f7",
        "primary-dim": "rgba(244, 245, 247, 0.12)",
        accent: "#6c79f5",
        textMain: "#f4f5f7",
        textMuted: "#9da3ae",
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
        sans: ["Inter_400Regular", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
