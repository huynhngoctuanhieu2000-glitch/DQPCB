import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import fs from 'node:fs/promises'
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
})
