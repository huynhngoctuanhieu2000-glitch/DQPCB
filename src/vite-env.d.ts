

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
