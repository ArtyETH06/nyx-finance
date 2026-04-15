import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/__nyx_api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/api${path.replace(/^\/__nyx_api/, '')}`,
      },
    },
  },
})
