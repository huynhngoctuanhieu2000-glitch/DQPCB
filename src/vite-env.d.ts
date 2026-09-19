

/**
 * Cầu nối do electron/preload.ts dựng. Không có khi chạy trên trình duyệt, nên
 * mọi chỗ dùng đều phải kiểm tra trước.
 */
interface Window {
  electronFiles?: {
    /** Đường dẫn thật của file người dùng thả vào; rỗng nếu không lấy được. */
    getPathForFile(file: File): string
  }
}

/** Bơm lúc build từ vite.config.ts (define). */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __BUILD_TIME__: string
