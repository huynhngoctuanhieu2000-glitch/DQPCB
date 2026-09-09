import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST || '', '../public')

let win: BrowserWindow | null
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - SystemJS interoperability
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Disable default native menu bar
  win.setMenu(null)

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })
  win.webContents.on('console-message', (_event, _level, message, _line, _sourceId) => {
    console.log(`[Renderer] ${message}`)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(process.env.DIST || '', 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Lưu file báo giá: renderer dựng xong bytes rồi nhờ main mở hộp thoại "Save as".
ipcMain.handle(
  'quotation:save',
  async (_event, payload: { fileName: string; data: Uint8Array }) => {
    const target = win
      ? await dialog.showSaveDialog(win, {
          title: 'Lưu báo giá',
          defaultPath: payload.fileName,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
        })
      : await dialog.showSaveDialog({ defaultPath: payload.fileName })

    if (target.canceled || !target.filePath) return { canceled: true }
    await fs.writeFile(target.filePath, Buffer.from(payload.data))
    return { canceled: false, filePath: target.filePath }
  }
)

// Xuất báo giá PDF: renderer gửi sang một trang HTML tự chứa (ảnh đã là data URL),
// main nạp vào một cửa sổ ẩn rồi in ra PDF. Làm ở đây thay vì dùng jsPDF để khỏi
// phải nhúng font tiếng Việt — cửa sổ Chromium dùng font hệ thống là ra đúng chữ.
ipcMain.handle(
  'quotation:pdf',
  async (_event, payload: { fileName: string; html: string; defaultDir?: string }) => {
    // Mặc định lưu ngay cạnh file gerber vừa nạp — thư mục việc của khách đó.
    const defaultPath = payload.defaultDir
      ? path.join(payload.defaultDir, payload.fileName)
      : payload.fileName
    const target = win
      ? await dialog.showSaveDialog(win, {
          title: 'Lưu báo giá PDF',
          defaultPath,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
      : await dialog.showSaveDialog({ defaultPath })

    if (target.canceled || !target.filePath) return { canceled: true }

    // Nạp qua file tạm chứ không phải data: URL — trang có mấy ảnh base64 nên chuỗi
    // rất dài, data: URL dễ chạm giới hạn độ dài và phải encode lằng nhằng.
    const tmp = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), 'dqpcb-baogia-')),
      'bao-gia.html'
    )
    await fs.writeFile(tmp, payload.html, 'utf-8')

    // A4 ngang, lề 0.3in -> vùng in 11.09 x 7.67 inch. Dựng cửa sổ đúng bề ngang đó
    // để đo được chiều cao thật của trang theo cách nó sẽ được in.
    const MARGIN_IN = 0.3
    const PAGE_W = Math.round((11.69 - MARGIN_IN * 2) * 96)
    const PAGE_H = Math.round((8.27 - MARGIN_IN * 2) * 96)

    const sheet = new BrowserWindow({
      show: false,
      width: PAGE_W,
      height: PAGE_H,
      webPreferences: { offscreen: true },
    })
    try {
      await sheet.loadFile(tmp)

      // Báo giá ngắn (một vài dòng hàng) phải gói gọn một trang như form mẫu, nhưng
      // co chữ mãi thì đến lúc không đọc nổi — quá ngưỡng thì để nó sang trang.
      const contentH = (await sheet.webContents.executeJavaScript(
        'document.body.scrollHeight'
      )) as number
      const scale =
        Number.isFinite(contentH) && contentH > PAGE_H
          ? Math.max(0.55, Math.floor((PAGE_H / contentH) * 100) / 100)
          : 1

      const pdf = await sheet.webContents.printToPDF({
        landscape: true,
        pageSize: 'A4',
        printBackground: true,
        scale,
        margins: { top: MARGIN_IN, bottom: MARGIN_IN, left: MARGIN_IN, right: MARGIN_IN },
      })
      await fs.writeFile(target.filePath, pdf)
      return { canceled: false, filePath: target.filePath }
    } finally {
      sheet.destroy()
      await fs.rm(path.dirname(tmp), { recursive: true, force: true }).catch(() => {})
    }
  }
)

// Mở thư mục chứa file vừa lưu và bôi sẵn file đó — dùng cho nút "Mở thư mục"
// sau khi xuất báo giá.
ipcMain.handle('shell:showInFolder', (_event, filePath: string) => {
  if (typeof filePath !== 'string' || filePath === '') return false
  shell.showItemInFolder(filePath)
  return true
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
})
