import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/Proyecto_Canvas/' : '/',
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/Templates/**', '**/locales/**', '**/TablaDyes_v1.json']
    }
  }
}))
