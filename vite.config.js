import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = {
  "/api": { target: process.env.PLUTUS_API_TARGET || "http://127.0.0.1:8000", changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, "") },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
})
