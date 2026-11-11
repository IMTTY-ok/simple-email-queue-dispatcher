import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Development proxy → Firebase Cloud Functions emulator (functions)
      '/api': {
        target: 'http://127.0.0.1:5001/email-dispatcher-43118/us-central1/backend',
        changeOrigin: true,
      },
    },
  },
})
