import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { manifestRuntime } from './scripts/vite-plugin-manifest-runtime.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [manifestRuntime(), react()],
})
