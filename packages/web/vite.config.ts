import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const rootPackageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
) as { version?: string }

export default defineConfig({
  plugins: [react()],
  define: {
    __CLAWMASTER_VERSION__: JSON.stringify(rootPackageJson.version ?? '0.0.0'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 16223,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:16224',
        changeOrigin: true,
      },
    },
  },
})
