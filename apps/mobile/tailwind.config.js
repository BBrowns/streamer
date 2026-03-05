/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        surface: "#0f0f0f",
        "surface-bright": "#1a1a1a",
        primary: "#e50914", // Netflix-esque vibrant red accent
        "primary-dim": "rgba(229, 9, 20, 0.15)",
        accent: "#ffffff",
        textMain: "#ffffff",
        textMuted: "#a3a3a3",
        error: "#ef4444",
        success: "#22c55e",
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
      fontFamily: {
        // We will default to system sans for now, but explicit slots allow for easy swapping to 'Inter' or 'Roboto' later if loaded.
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
