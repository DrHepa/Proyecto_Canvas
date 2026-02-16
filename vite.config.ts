import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Proyecto_Canvas_web/',
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/Templates/**', '**/locales/**', '**/TablaDyes_v1.json']
    }
  }
})
