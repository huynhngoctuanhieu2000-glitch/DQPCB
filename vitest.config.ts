/**
 * Cấu hình riêng cho test. KHÔNG dùng vite.config.ts vì nó nạp vite-plugin-electron:
 * plugin đó thay `node:fs`… bằng shim `require()` cho tiến trình renderer của Electron,
 * và shim đó nổ khi chạy trong Node (ESM) của vitest.
 *
 * Mặc định chạy trong Node; file test nào cần DOM thì ghi `// @vitest-environment jsdom`
 * ở đầu file (chỉ vài test giao diện cần, dựng jsdom mất ~2 s mỗi file).
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // test/_scratch: file dò lỗi tạm của từng đợt làm việc, không phải test hồi quy —
    // để chúng trong `npm test` thì bảng kết quả lúc nào cũng đỏ vì việc đang dở.
    exclude: ['test/_scratch/**', 'node_modules/**', 'dist/**'],
  },
})
