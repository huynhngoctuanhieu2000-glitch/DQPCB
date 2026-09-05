import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    // Giữ đúng một bản three cho code của app (Viewer3D). Lưu ý: KHÔNG áp được cho
    // web-gerber vì nó bundle sẵn three 0.175 vào dist, không import từ ngoài.
    dedupe: ['three'],
  },
  optimizeDeps: {
    include: ['three', 'web-gerber'],
  },
  plugins: [
    react(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: 'electron/preload.ts',
      },
      // Optional: Use Node.js API in the Renderer process
      renderer: {},
    }),
  ],
})
