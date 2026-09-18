/**
 * Chụp chế độ "2 Mặt" ra một ảnh PNG: hai khung Top/Bot ghép cạnh nhau đúng như đang
 * nhìn, kèm nhãn kích thước — để gửi khách hoặc dán vào báo giá mà không
 * phải chụp màn hình rồi cắt tay.
 */

import logoUrl from '../../assets/quotation/logo-thien-lam-full.png'

/**
 * Logo Thiên Lâm in mờ phía sau bo làm dấu bản quyền. Ảnh gửi cho khách hay bị chuyển
 * tiếp đi nơi khác; logo chìm cho biết ảnh dựng từ đâu mà không che mất bo.
 */
const WATERMARK_ALPHA = 0.12
let logoPromise: Promise<HTMLImageElement | null> | null = null
const loadLogo = () => {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null) // thiếu logo thì vẫn chụp, chỉ không có dấu
      img.src = logoUrl
    })
  }
  return logoPromise
}

export interface TwoSideCaptureInput {
  top: HTMLCanvasElement
  bottom: HTMLCanvasElement
  /** Hệ số phóng đã dùng khi chụp từng khung, để nhãn vẽ ra cùng cỡ với hình. */
  scale: number
  /** Khoảng trắng giữa hai khung, tính bằng px màn hình (trùng `gap` của khung chia đôi). */
  gapPx: number
  background: string
  layerCount: number
  widthMM: number
  heightMM: number
}

const drawTag = (
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  s: number,
  opts: { radius: number; padX: number; padY: number; font: number; center?: boolean },
) => {
  g.font = `600 ${opts.font * s}px -apple-system, "Segoe UI", Roboto, sans-serif`
  const w = g.measureText(text).width + opts.padX * 2 * s
  const h = (opts.font + opts.padY * 2) * s
  const left = opts.center ? x - w / 2 : x
  g.fillStyle = 'rgba(15,23,42,0.9)'
  g.strokeStyle = '#334155'
  g.lineWidth = s
  g.beginPath()
  g.roundRect(left, y, w, h, opts.radius * s)
  g.fill()
  g.stroke()
  g.fillStyle = '#e2e8f0'
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.fillText(text, left + opts.padX * s, y + h / 2)
}

/** Khung chữ nhật bao phần KHÔNG phải nền trong một canvas, hoặc null nếu trống. */
const contentBox = (c: HTMLCanvasElement, background: string): [number, number, number, number] | null => {
  const g = c.getContext('2d')
  if (!g) return null
  const bg = parseInt(background.replace('#', ''), 16)
  const br = (bg >> 16) & 255, bgg = (bg >> 8) & 255, bb = bg & 255
  const { data } = g.getImageData(0, 0, c.width, c.height)
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4
      // Lệch quá 6/255 so với màu nền mới tính là hình — mép khử răng cưa vẫn bắt được.
      if (Math.abs(data[i] - br) + Math.abs(data[i + 1] - bgg) + Math.abs(data[i + 2] - bb) > 18) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1]
}

/**
 * Bản sao của khung với nền canvas làm trong suốt, để logo chìm phía sau lộ ra ở chỗ
 * không có bo. Khung WebGL vẽ nền đặc (#eeeeee) nên dán thẳng là che mất logo.
 */
const withTransparentBackground = (c: HTMLCanvasElement, background: string): HTMLCanvasElement => {
  const out = document.createElement('canvas')
  out.width = c.width
  out.height = c.height
  const g = out.getContext('2d')
  if (!g) return c
  g.drawImage(c, 0, 0)
  const bg = parseInt(background.replace('#', ''), 16)
  const br = (bg >> 16) & 255, bgg = (bg >> 8) & 255, bb = bg & 255
  const img = g.getImageData(0, 0, out.width, out.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgg) + Math.abs(d[i + 2] - bb) <= 18) d[i + 3] = 0
  }
  g.putImageData(img, 0, 0)
  return out
}

/**
 * Ghép hai khung thành một canvas, CẮT SÁT phần có bo. Khung xem cao hết cột giữa nên
 * chụp nguyên khung ra một dải dài ngoằng với hai bo bé tí ở giữa; người nhận cần ảnh
 * vừa khít bo. Hai mặt cắt cùng một dải dọc để vẫn thẳng hàng nhau.
 */
export const composeTwoSides = async (input: TwoSideCaptureInput): Promise<HTMLCanvasElement> => {
  const { top, bottom, scale: s, gapPx, background } = input
  // Khung bị thu về 0 (cửa sổ quá hẹp, panel hai bên chiếm hết) thì toBlob trả null
  // và người dùng chỉ thấy "không tạo được ảnh" — nói thẳng nguyên nhân.
  if (!top.width || !top.height || !bottom.width || !bottom.height) {
    throw new Error('Khung xem đang quá nhỏ để chụp — nới rộng cửa sổ hoặc thu gọn panel hai bên')
  }
  const bt = contentBox(top, background) ?? [0, 0, top.width, top.height]
  const bb = contentBox(bottom, background) ?? [0, 0, bottom.width, bottom.height]
  // Lề đều quanh bo. Nhãn kích thước nằm trong một DẢI RIÊNG dưới bo, không đè lên
  // bo — panel cao kín khung thì nhãn đặt chồng sẽ che mất rãnh dưới cùng.
  const padX = 24 * s, padTop = 24 * s, padBottom = 24 * s
  const bandH = 64 * s
  const y0 = Math.max(0, Math.min(bt[1], bb[1]) - padTop)
  const y1 = Math.min(Math.max(top.height, bottom.height), Math.max(bt[3], bb[3]) + padBottom)
  const cut = (c: HTMLCanvasElement, box: number[]) => ({
    x: Math.max(0, box[0] - padX),
    w: Math.min(c.width, box[2] + padX) - Math.max(0, box[0] - padX),
  })
  const ct = cut(top, bt), cb = cut(bottom, bb)
  const boardsH = y1 - y0
  const H = boardsH + bandH
  const gap = gapPx * s
  const W = ct.w + gap + cb.w
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return c

  g.fillStyle = background
  g.fillRect(0, 0, W, H)

  // Logo mờ ở giữa, sau bo: cao bằng ~70% chiều cao ảnh, không phóng quá bề ngang.
  const logo = await loadLogo()
  if (logo) {
    const lh = Math.min(H * 0.7, (W * 0.6 * logo.height) / logo.width)
    const lw = (lh * logo.width) / logo.height
    g.globalAlpha = WATERMARK_ALPHA
    g.drawImage(logo, (W - lw) / 2, (boardsH - lh) / 2, lw, lh)
    g.globalAlpha = 1
  }

  const topT = withTransparentBackground(top, background)
  const bottomT = withTransparentBackground(bottom, background)
  g.drawImage(topT, ct.x, y0, ct.w, boardsH, 0, 0, ct.w, boardsH)
  g.drawImage(bottomT, cb.x, y0, cb.w, boardsH, ct.w + gap, 0, cb.w, boardsH)

  // Không in nhãn TOP/BOT lên ảnh — ảnh gửi khách chỉ cần hai mặt bo và kích thước.

  // Nhãn kích thước: chữ to, căn giữa dải riêng ở đáy.
  const size = `${input.layerCount} lớp   |   ${input.widthMM.toFixed(2)} × ${input.heightMM.toFixed(2)} mm`
  const font = 20, padY = 9
  drawTag(g, size, W / 2, boardsH + (bandH - (font + padY * 2) * s) / 2, s, { radius: 999, padX: 22, padY, font, center: true })
  return c
}

/**
 * Đưa ảnh vào clipboard để dán thẳng vào Zalo/mail/báo giá — người lập chụp bo để
 * gửi khách chứ không phải để lưu file. Clipboard API chạy được cả trong Electron
 * (Chromium) lẫn trình duyệt; cú bấm nút đã cho trang focus nên không bị từ chối.
 */
interface IpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

export const copyPng = async (canvas: HTMLCanvasElement): Promise<void> => {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Không tạo được ảnh PNG')
  // Electron: trang chạy trong app bị Chromium từ chối Clipboard API, nên nhờ main
  // ghi bằng clipboard của Electron.
  const ipc = (window as unknown as { ipcRenderer?: IpcBridge }).ipcRenderer
  if (ipc) {
    await ipc.invoke('image:copy', new Uint8Array(await blob.arrayBuffer()))
    return
  }
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Trình duyệt này không cho copy ảnh vào clipboard')
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  } catch (err) {
    // Trình duyệt từ chối khi trang chưa có focus hoặc bị chính sách chặn; nói bằng
    // tiếng Việt thay vì ném nguyên "Write permission denied" ra màn hình.
    if ((err as { name?: string })?.name === 'NotAllowedError') {
      throw new Error('Trình duyệt chặn copy vào clipboard — bấm vào khung bo rồi thử lại')
    }
    throw err
  }
}
