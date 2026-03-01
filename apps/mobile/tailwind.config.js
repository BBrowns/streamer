/** @type {import('tailwindcss').Config} */
module.exports = {
    // NOTE: Update this to include the paths to all of your component files.
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
            colors: {
                background: '#0a0a1a',    // Deep cinematic background
                surface: '#1a1a3e',       // Frosted glass surface
                primary: '#818cf8',       // Indigo primary brand color
                textMain: '#e0e0ff',
                textMuted: '#9ca3af',
                error: '#f87171',
            }
        },
    },
    plugins: [],
}
