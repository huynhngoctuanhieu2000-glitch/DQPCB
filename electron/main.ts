import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
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
    // Icon cửa sổ + taskbar. Windows dùng .ico (đủ cỡ 16→256), nơi khác dùng .png.
    icon: path.join(process.env.VITE_PUBLIC || '', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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
  async (_event, payload: { fileName: string; data: Uint8Array; defaultDir?: string }) => {
    // Mặc định lưu ngay cạnh file gerber vừa nạp — thư mục việc của khách đó,
    // giống hộp thoại lưu PDF.
    const defaultPath = payload.defaultDir
      ? path.join(payload.defaultDir, payload.fileName)
      : payload.fileName
    const target = win
      ? await dialog.showSaveDialog(win, {
          title: 'Lưu báo giá',
          defaultPath,
          filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
        })
      : await dialog.showSaveDialog({ defaultPath })

    if (target.canceled || !target.filePath) return { canceled: true }
    await fs.writeFile(target.filePath, Buffer.from(payload.data))
    return { canceled: false, filePath: target.filePath }
  }
)

// Ảnh chụp bo đi vào clipboard qua main: Clipboard API trong renderer bị Chromium của
// Electron từ chối.
//
// Electron 44 có clipboard.write([ClipboardItem]) kiểu W3C nhưng với ảnh nó KHÔNG ghi
// gì cả — đo trực tiếp: sau write, has('image/png') = false, read() trả ảnh cũ, còn
// text/plain thì ghi bình thường. Nên clipboard giữ mãi ảnh chụp trước đó. Trên
// Windows đi vòng qua PowerShell (System.Windows.Forms.Clipboard.SetImage, cần STA):
// ghi PNG ra file tạm, ghi vào clipboard, đọc lại được đúng kích thước. Mất ~2 s vì
// phải khởi động PowerShell. Máy khác thì đành thử clipboard.write.
const requireCjs = createRequire(import.meta.url)
ipcMain.handle('image:copy', async (_event, data: Uint8Array) => {
  if (process.platform === 'win32') {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dqpcb-clip-'))
    const file = path.join(dir, 'board.png')
    await fs.writeFile(file, Buffer.from(data))
    try {
      const script =
        'Add-Type -AssemblyName System.Windows.Forms,System.Drawing; ' +
        `$img = [Drawing.Image]::FromFile('${file.replace(/'/g, "''")}'); ` +
        '[Windows.Forms.Clipboard]::SetImage($img); $img.Dispose()'
      await new Promise<void>((resolve, reject) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
          { windowsHide: true, timeout: 15000 },
          (err, _out, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()),
        )
      })
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
    return { ok: true }
  }
  const { clipboard, ClipboardItem } = requireCjs('electron') as {
    clipboard: { write(items: unknown[]): Promise<void> }
    ClipboardItem: new (items: Record<string, Blob>) => unknown
  }
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([data], { type: 'image/png' }) })])
  return { ok: true }
})

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

// Mở file Gerber bằng hộp chọn file GỐC của Windows, mở sẵn ở thư mục vừa dùng.
//
// Hộp chọn của <input type=file> trong Electron không nhớ thư mục cuối — mỗi lần mở lại
// rơi vào một thư mục cũ trong lịch sử, người lập phải bấm lại đường dẫn. Thư mục cuối
// lưu ra userData nên tắt app mở lại vẫn nhớ; kéo thả file cũng cập nhật nó.
const statePath = () => path.join(app.getPath('userData'), 'dqpcb-state.json')
const readState = async (): Promise<{ lastOpenDir?: string }> => {
  try {
    return JSON.parse(await fs.readFile(statePath(), 'utf8'))
  } catch {
    return {}
  }
}
const rememberDir = async (dir: string) => {
  if (typeof dir !== 'string' || dir === '') return
  const state = await readState()
  state.lastOpenDir = dir
  await fs.writeFile(statePath(), JSON.stringify(state)).catch(() => {})
}

ipcMain.handle('files:rememberDir', (_event, dir: string) => rememberDir(dir))

ipcMain.handle('files:open', async (_event, opts: { folder?: boolean } = {}) => {
  const { lastOpenDir } = await readState()
  const defaultPath = lastOpenDir && (await fs.stat(lastOpenDir).catch(() => null))?.isDirectory() ? lastOpenDir : undefined
  const options: Electron.OpenDialogOptions = opts.folder
    ? { title: 'Mở thư mục Gerber', defaultPath, properties: ['openDirectory'] }
    : {
        title: 'Mở file Gerber',
        defaultPath,
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Gerber (ZIP, RAR, file lẻ)', extensions: ['zip', 'rar', 'gtl', 'gbl', 'gts', 'gbs', 'gto', 'gbo', 'gtp', 'gbp', 'gko', 'gm1', 'gbr', 'gbx', 'drl', 'xln', 'txt', 'nc'] },
          { name: 'Tất cả file', extensions: ['*'] },
        ],
      }
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (picked.canceled || picked.filePaths.length === 0) return { canceled: true, files: [] }

  // Thư mục: lấy các file nằm ngay trong đó (bộ Gerber chưa nén, hoặc vài file ZIP).
  let paths = picked.filePaths
  if (opts.folder) {
    const dir = picked.filePaths[0]
    const entries = await fs.readdir(dir, { withFileTypes: true })
    paths = entries.filter((e) => e.isFile()).map((e) => path.join(dir, e.name))
  }
  await rememberDir(opts.folder ? picked.filePaths[0] : path.dirname(picked.filePaths[0]))

  const files = await Promise.all(
    paths.map(async (p) => ({ name: path.basename(p), path: p, data: new Uint8Array(await fs.readFile(p)) }))
  )
  return { canceled: false, files }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
})
