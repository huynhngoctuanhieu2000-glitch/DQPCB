/**
 * Ghi file báo giá ra đĩa.
 *
 * Chạy trong Electron thì mở hộp thoại "Save as" của hệ điều hành; chạy trên
 * trình duyệt (npm run dev thuần) thì rơi về tải xuống bình thường, để app vẫn
 * dùng được ở cả hai nơi.
 */

interface IpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

declare global {
  interface Window {
    ipcRenderer?: IpcBridge
  }
}

export interface SaveResult {
  /** Người dùng bấm Cancel ở hộp thoại — không phải lỗi. */
  canceled: boolean
  /** Đường dẫn đã lưu; trình duyệt không biết nên để trống. */
  filePath?: string
}

export const saveXlsx = async (bytes: Uint8Array, fileName: string): Promise<SaveResult> => {
  const ipc = window.ipcRenderer
  if (ipc?.invoke) {
    return (await ipc.invoke('quotation:save', { fileName, data: bytes })) as SaveResult
  }

  // ArrayBuffer riêng cho Blob: bytes có thể là view vào buffer lớn hơn.
  const blob = new Blob([bytes.slice().buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return { canceled: false }
}
