// File: client/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "\"SF Pro Display\"", "\"Segoe UI\"", "sans-serif"]
      }
    }
  },
  plugins: []
};
