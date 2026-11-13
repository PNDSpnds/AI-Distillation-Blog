import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vite 配置：React + Tailwind v4 + @ 路径别名
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 监听所有网卡，方便用手机在同一局域网内预览
    host: true,
    port: 5173,
    // 开发时把接口和封面请求转给本地后端，避免跨域配置
    proxy: {
      '/api': 'http://localhost:8787',
      '/media': 'http://localhost:8787',
    },
  },
})
