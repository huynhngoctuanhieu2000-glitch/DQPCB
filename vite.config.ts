import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }
/** Mã commit ngắn: Vercel cấp qua env, máy dev hỏi git; không có thì để trống. */
const commit = (() => {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
})()

// https://vitejs.dev/config/
export default defineConfig({
  // Hiện ở Cài đặt để biết đang chạy bản nào — mỗi lần deploy là commit và giờ build đổi.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
