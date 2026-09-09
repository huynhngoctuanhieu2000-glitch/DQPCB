import { ipcRenderer, contextBridge, webUtils } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APIs you need here.
  // ...
})

/**
 * Đường dẫn thật của file người dùng thả vào.
 *
 * Từ Electron 32 trở đi `File.path` bị bỏ, phải hỏi qua `webUtils`. App dùng đường
 * dẫn này để đoán tên khách (thư mục ngay trước thư mục năm) và để mặc định chỗ lưu
 * file PDF về đúng thư mục chứa gerber. Chạy trên trình duyệt thì không có, và cả
 * hai việc trên đều tự bỏ qua.
 */
contextBridge.exposeInMainWorld('electronFiles', {
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
})
