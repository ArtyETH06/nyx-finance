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
          bg:           '#070B1A',
          secondary:    '#0E1428',
          card:         '#111A35',
          border:       '#1F2937',
          text:         '#E6E9F2',
          muted:        '#8C94B3',
          accent:       '#6C5CE7',
          'accent-h':   '#7D6BFF',
          success:      '#22C55E',
          danger:       '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'accent':      '0 4px 12px rgba(108,92,231,0.25)',
        'card-hover':  '0 0 0 1px rgba(108,92,231,0.15)',
        'pill-hover':  '0 0 0 1px rgba(108,92,231,0.35), 0 0 12px rgba(108,92,231,0.1)',
      },
    },
  },
  plugins: [],
}
