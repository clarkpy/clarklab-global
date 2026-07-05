import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const appRoot = __dirname
const repoRoot = path.resolve(appRoot, '..')

function envDirectory(): string {
  if (fs.existsSync(path.join(repoRoot, '.env'))) return repoRoot
  if (fs.existsSync(path.join(appRoot, '.env'))) return appRoot
  return appRoot
}

export default defineConfig({
  envDir: envDirectory(),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(appRoot, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'sonner',
      '@tanstack/react-query',
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
