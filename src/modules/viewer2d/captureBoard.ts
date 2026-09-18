/**
 * Chụp chế độ "2 Mặt" ra một ảnh PNG: hai khung Top/Bot ghép cạnh nhau đúng như đang
 * nhìn, kèm nhãn mặt và nhãn kích thước — để gửi khách hoặc dán vào báo giá mà không
 * phải chụp màn hình rồi cắt tay.
 */

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

/** Ghép hai khung thành một canvas; kích thước ảnh = tổng hai khung + khoảng trống. */
export const composeTwoSides = (input: TwoSideCaptureInput): HTMLCanvasElement => {
  const { top, bottom, scale: s, gapPx, background } = input
  // Khung bị thu về 0 (cửa sổ quá hẹp, panel hai bên chiếm hết) thì toBlob trả null
  // và người dùng chỉ thấy "không tạo được ảnh" — nói thẳng nguyên nhân.
  if (!top.width || !top.height || !bottom.width || !bottom.height) {
    throw new Error('Khung xem đang quá nhỏ để chụp — nới rộng cửa sổ hoặc thu gọn panel hai bên')
  }
  const gap = gapPx * s
  const W = top.width + gap + bottom.width
  const H = Math.max(top.height, bottom.height)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return c

  g.fillStyle = background
  g.fillRect(0, 0, W, H)
  g.drawImage(top, 0, 0)
  g.drawImage(bottom, top.width + gap, 0)

  // Nhãn mặt ở góc trên mỗi khung, giống overlay trên màn hình.
  const tag = { radius: 4, padX: 8, padY: 3, font: 11 }
  drawTag(g, 'TOP — nhìn từ trên', 8 * s, 8 * s, s, tag)
  drawTag(g, 'BOT — nhìn từ dưới', top.width + gap + 8 * s, 8 * s, s, tag)

  // Nhãn kích thước ở đáy, giữa hai khung.
  const size = `${input.layerCount} lớp   |   ${input.widthMM.toFixed(2)} × ${input.heightMM.toFixed(2)} mm`
  drawTag(g, size, W / 2, H - (12 + 30) * s, s, { radius: 999, padX: 14, padY: 6, font: 12, center: true })
  return c
}

/** Tên file ảnh: theo tên bo, bỏ ký tự Windows không cho phép. */
export const captureFileName = (projectName: string): string => {
  const base =
    (projectName || '')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .trim() || 'board'
  return `${base}_2mat.png`
}

interface IpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/**
 * Lưu PNG: trong Electron mở hộp thoại "Save as" qua main; trên trình duyệt thì tải
 * xuống như một link download.
 */
export const savePng = async (canvas: HTMLCanvasElement, fileName: string): Promise<void> => {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Không tạo được ảnh PNG')

  const ipc = (window as unknown as { ipcRenderer?: IpcBridge }).ipcRenderer
  if (ipc) {
    const data = new Uint8Array(await blob.arrayBuffer())
    await ipc.invoke('image:save', { fileName, data })
    return
  }

  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  } finally {
    // Thu hồi sau khi trình duyệt đã kịp bắt đầu tải.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
