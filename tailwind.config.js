// tailwind.config.js
/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors')

module.exports = {
  darkMode: 'class', // Ensure class-based dark mode is enabled
  content: [
    "./index.html", // Scan HTML for class usage
    "./renderer.js", // Scan JS in case you dynamically add/remove classes
  ],
  theme: {
    extend: {
      // Define the color palettes to use
      colors: {
        gray: colors.zinc, // Use zinc for primary grays (neutral dark)
        accent: colors.sky, // Use sky blue as the accent color
        // Keep other semantic colors if needed for status etc.
        red: colors.red,
        emerald: colors.emerald,
        amber: colors.amber,
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'), // Keep the forms plugin for better defaults
  ],
}