/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nyx: {
          bg: '#0B0F14',
          card: '#111827',
          border: '#1F2937',
          text: '#F3F4F6',
          muted: '#9CA3AF',
          accent: '#2563EB',
          success: '#10B981',
          danger: '#EF4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
