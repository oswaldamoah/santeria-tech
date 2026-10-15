import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site uses hash routing (/#/sell/iphone), so a relative base works on
// GitHub Pages whether the repo is served from user.github.io/<repo>/ or a custom domain.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
})
