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
          bg:         'var(--nyx-bg)',
          secondary:  'var(--nyx-secondary)',
          card:       'var(--nyx-card)',
          border:     'var(--nyx-border)',
          text:       'var(--nyx-text)',
          muted:      'var(--nyx-muted)',
          accent:     'var(--nyx-accent)',
          'accent-h': 'var(--nyx-accent-h)',
          success:    'var(--nyx-success)',
          danger:     'var(--nyx-danger)',
          warning:    'var(--nyx-warning)',
          hover:      'var(--nyx-hover)',
          active:     'var(--nyx-active)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'accent':     'var(--nyx-shadow-accent)',
        'card-hover': 'var(--nyx-shadow-card-hover)',
        'pill-hover': 'var(--nyx-shadow-pill)',
      },
    },
  },
  plugins: [],
}
