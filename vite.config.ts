import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // base: './' is required for Capacitor — makes all asset paths relative
  // so they work correctly inside the iOS WebView (file:// context)
  base: './',
  plugins: [
    react(),
    tailwindcss(),
  ],
})
