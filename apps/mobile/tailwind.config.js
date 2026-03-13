/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#010101", // True Black for AMOLED
        surface: "#080808", // Almost black for panels
        "surface-bright": "#121212",
        primary: "#00f2ff", // Cyber Cyan - aggressive & modern
        "primary-dim": "rgba(0, 242, 255, 0.1)",
        accent: "#ffffff",
        textMain: "#ffffff",
        textMuted: "#888888",
        error: "#ff3b3b",
        success: "#00ff88",
        warning: "#ffd600",
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
