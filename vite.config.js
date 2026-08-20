import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Honour PORT so a supervisor can assign the port. Vite does not read it
    // on its own, and would otherwise sit on 5173 whatever it was handed.
    port: Number(process.env.PORT) || 5173,
  },
})
