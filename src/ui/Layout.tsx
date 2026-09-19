import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BOARD_RENDERED_EVENT, Viewer2DWebGL } from '../modules/viewer2d/Viewer2D.WebGL'
import type { CaptureFn } from '../modules/viewer2d/Viewer2D.WebGL'
import { composeTwoSides, copyPng } from '../modules/viewer2d/captureBoard'
import { BoardDataModel } from '../models/BoardDataModel'
import type { BoardState } from '../models/BoardDataModel'
import { GerberParser } from '../lib/gerber-reader'
import { QuotationPanel } from '../modules/quotation/QuotationPanel'
import type { QuotationSeed } from '../modules/quotation/QuotationPanel'
import { PricingCard } from '../modules/pricing/PricingCard'
import { SettingsPanel } from '../modules/settings/SettingsPanel'

/** Màn hẹp (điện thoại): hai cột bên thành ngăn kéo, thanh công cụ gọn lại. */
const MOBILE_QUERY = '(max-width: 768px)'
function useIsMobile(): boolean {
  const [m, setM] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

export const Layout: React.FC = () => {
  const isMobile = useIsMobile()
  const [drawer, setDrawer] = useState<'layers' | 'info' | null>(null)
  const [boardState, setBoardState] = useState(BoardDataModel.getState())
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  /**
   * Màn chờ mở file. Tắt khi viewer báo ĐÚNG bo mới đã dựng xong (BOARD_RENDERED_EVENT),
   * không phải lúc đọc file xong: giữa hai mốc đó khung xem vẫn còn bo cũ trong khi
   * cột bên đã là thông tin bo mới — đang mở nhiều bo là dễ đọc nhầm bo này ra bo kia.
   */
  const [opening, setOpening] = useState<{ name: string; waitFor: string | null } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showQuotation, setShowQuotation] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  /**
   * Giá đã tính cho từng bo, theo id. Đặt ở đây chứ không ở trong QuotationPanel vì
   * panel chỉ tồn tại khi đang mở — giá phải sống trước nó, để nút "Lấy từ bo đang
   * mở" kéo được đúng số của từng bo, kể cả bo không còn là bo đang mở.
   */
  const [prices, setPrices] = useState<Record<string, QuotationSeed>>({})
  const handlePriceChange = useCallback((boardId: string, price: QuotationSeed | null) => {
    setPrices((prev) => {
      // Giá không đổi thì trả lại đúng object cũ để React bỏ qua lượt render — chốt
      // chặn thứ hai chống vòng lặp nếu phía thẻ lỡ báo trùng.
      if (price && JSON.stringify(prev[boardId]) === JSON.stringify(price)) return prev
      if (price) return { ...prev, [boardId]: price }
      if (!(boardId in prev)) return prev
      const next = { ...prev }
      delete next[boardId]
      return next
    })
  }, [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** Chọn cả thư mục (webkitdirectory) — bộ Gerber chưa nén, file lẻ nằm chung một chỗ. */
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  // Kích thước khung chia đôi — nhãn kích thước cần biết để bám sát mép bo
  const splitRef = useRef<HTMLDivElement>(null)
  const [splitSize, setSplitSize] = useState<{ w: number; h: number } | null>(null)
  // Hàm chụp của hai khung Top/Bot, do mỗi Viewer2DWebGL gán vào khi dựng xong cảnh
  const captureTopRef = useRef<CaptureFn | null>(null)
  const captureBotRef = useRef<CaptureFn | null>(null)
  const [capturing, setCapturing] = useState(false)
  // Báo "đã copy" ngay trên nút vài giây, vì copy vào clipboard không có dấu hiệu nào khác
  const [copied, setCopied] = useState(false)

  const captureTwoSides = async () => {
    if (!boardState.bounds || capturing) return
    setCapturing(true)
    try {
      // Mỗi mặt cỡ ~2000 px theo cạnh dài, bất kể bo 20 mm hay panel 300 mm — ảnh gửi
      // khách phóng to ra xem chân linh kiện, 1000 px bị vỡ.
      const { widthMM, heightMM } = boardState.bounds
      const pxPerMm = 2000 / (Math.max(widthMM, heightMM) + 12)
      // Ảnh bo nào cũng ~2000 px mỗi mặt nên nhãn/lề cũng cố định một cỡ. Tính theo
      // pxPerMm thì bo càng to nhãn càng bé (bo 350 mm chỉ còn một nửa bo 184 mm).
      const scale = 2
      const top = captureTopRef.current?.(pxPerMm)
      const bottom = captureBotRef.current?.(pxPerMm)
      if (!top || !bottom) throw new Error('Khung chưa dựng xong, thử lại sau một chút')
      const img = await composeTwoSides({
        top,
        bottom,
        scale,
        gapPx: SPLIT_GAP_PX,
        background: '#eeeeee',
        name: boardState.projectName ?? '',
        layerCount: boardState.layerCount,
        widthMM: boardState.bounds.widthMM,
        heightMM: boardState.bounds.heightMM,
      })
      await copyPng(img)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không chụp được ảnh bo')
    } finally {
      setCapturing(false)
    }
  }

  useEffect(() => {
    return BoardDataModel.subscribe((state) => {
      setBoardState(state)
    })
  }, [])

  useEffect(() => {
    const el = splitRef.current
    if (!el) return
    const ro = new ResizeObserver(() =>
      setSplitSize({ w: el.clientWidth, h: el.clientHeight })
    )
    ro.observe(el)
    setSplitSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
    // isLoaded phải có trong deps: khi đổi sang "2 Mặt" lúc chưa nạp bo thì khung
    // chia đôi chưa tồn tại, ref còn null nên observer không gắn được.
  }, [boardState.activeView, boardState.isLoaded])

  /** Bo vừa nạp → chờ viewer dựng xong nó; không nạp được bo nào thì tắt màn chờ luôn. */
  const awaitRender = (added: number) => {
    const s = BoardDataModel.getState()
    if (added === 0 || !s.activeBoardId || s.layers.length === 0) setOpening(null)
    else setOpening((o) => (o ? { ...o, waitFor: s.activeBoardId } : null))
  }

  // Viewer dựng xong đúng bo đang chờ thì tắt màn chờ.
  useEffect(() => {
    const onRendered = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail
      setOpening((o) => (o && o.waitFor && o.waitFor === id ? null : o))
    }
    window.addEventListener(BOARD_RENDERED_EVENT, onRendered)
    return () => window.removeEventListener(BOARD_RENDERED_EVENT, onRendered)
  }, [])

  // Dự phòng: bo dựng lỗi thì viewer không báo — đừng để màn chờ kẹt mãi.
  useEffect(() => {
    if (!opening?.waitFor) return
    const t = window.setTimeout(() => setOpening(null), 30000)
    return () => window.clearTimeout(t)
  }, [opening?.waitFor])

  const processFiles = async (files: File[], knownDirs?: Map<string, string>) => {
    if (!files || files.length === 0) return
    setIsLoading(true)
    setOpening({ name: files.map((f) => f.name).join(', '), waitFor: null })
    setErrorMessage(null)
    let added = 0

    try {
      const t0 = performance.now()
      const parsedBoards = await GerberParser.parseInputFiles(files)
      const parseMs = Math.round(performance.now() - t0)
      // Ghép lại thư mục thật của từng bo: parser báo bo đến từ archive nào, còn
      // đường dẫn thì chỉ Electron mới cho biết (từ bản 32 `File.path` đã bị bỏ).
      const dirByFile = new Map<string, string>(knownDirs)
      for (const file of files) {
        if (dirByFile.has(file.name)) continue
        const full = window.electronFiles?.getPathForFile(file) ?? ''
        if (full) dirByFile.set(file.name, full.replace(/[\\/][^\\/]*$/, ''))
      }
      // Kéo thả cũng tính là "vừa mở ở đây": lần sau hộp chọn file mở đúng thư mục này.
      const firstDir = [...dirByFile.values()][0]
      if (firstDir && !knownDirs) window.ipcRenderer?.invoke('files:rememberDir', firstDir).catch(() => {})
      // Gói file gerber rời không có archive nguồn (sourceFile rỗng) nên tra không ra;
      // mà thả cùng lượt thì chúng ở chung một thư mục, lấy tạm cái đầu tiên.
      const fallbackDir = [...dirByFile.values()][0] ?? ''
      const sourceDirs = parsedBoards.map(
        (b) => dirByFile.get(b.sourceFile ?? '') ?? fallbackDir
      )
      BoardDataModel.addBoards(parsedBoards, sourceDirs, parseMs)
      added = parsedBoards.length
    } catch (err: any) {
      console.error('Failed to parse Gerber files:', err)
      setErrorMessage(err?.message || 'Failed to read files. Please ensure it is a valid Gerber ZIP.')
    } finally {
      setIsLoading(false)
      awaitRender(added)
    }
  }

  /**
   * Mở hộp chọn file. Trong app (Electron) dùng hộp chọn GỐC của Windows qua main — nó
   * mở sẵn ở thư mục vừa dùng; hộp của <input type=file> thì không nhớ. Trên trình
   * duyệt không có main nên dùng input như cũ.
   */
  const openPicker = async (folder: boolean) => {
    const ipc = window.ipcRenderer
    if (!ipc) {
      ;(folder ? folderInputRef : fileInputRef).current?.click()
      return
    }
    try {
      const res = (await ipc.invoke('files:open', { folder })) as {
        canceled: boolean
        // Buffer qua IPC luôn nằm trên ArrayBuffer thường; khai rõ để File() nhận (TS 5.7+
        // tách Uint8Array<ArrayBufferLike> khỏi BlobPart).
        files: { name: string; path: string; data: Uint8Array<ArrayBuffer> }[]
      }
      if (res.canceled || res.files.length === 0) return
      const files = res.files.map((f) => new File([f.data], f.name))
      const dirs = new Map(res.files.map((f) => [f.name, f.path.replace(/[\/][^\/]*$/, '')]))
      processFiles(files, dirs)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Không mở được hộp chọn file')
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      await processFiles(files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      processFiles(files)
    }
    // Xoá lựa chọn, để mở lại đúng file vừa đóng vẫn kích hoạt được onChange.
    e.target.value = ''
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: '100vw',
        backgroundColor: '#121316',
        color: '#e2e8f0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        overflow: 'hidden',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept=".zip,.rar,.gtl,.gbl,.gts,.gbs,.gto,.gbo,.gko,.gm1,.drl,.txt,.*"
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFileInputChange}
        // @ts-expect-error — thuộc tính chuẩn-thực-tế của Chromium, React chưa khai kiểu
        webkitdirectory=""
        style={{ display: 'none' }}
      />

      {/* 1. TOP MENU BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: isMobile ? '40px' : '32px',
          backgroundColor: '#1a1c22',
          borderBottom: '1px solid #282b34',
          padding: '0 8px',
          fontSize: '13px',
          gap: isMobile ? '6px' : '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '8px', color: '#94a3b8', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '3px',
                backgroundColor: fileMenuOpen ? '#334155' : 'transparent',
                color: fileMenuOpen ? '#e2e8f0' : undefined,
              }}
              onClick={() => setFileMenuOpen((v) => !v)}
            >
              File
            </span>
            {fileMenuOpen && (
              <>
                {/* Bấm ra ngoài là đóng menu */}
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setFileMenuOpen(false)} />
                <div style={S_MENU.panel}>
                  <MenuItem
                    label="📂 Mở file Gerber…"
                    hint="ZIP, RAR hoặc file lẻ"
                    onClick={() => {
                      setFileMenuOpen(false)
                      openPicker(false)
                    }}
                  />
                  <MenuItem
                    label="🗂 Mở thư mục…"
                    hint="Cả thư mục Gerber chưa nén"
                    onClick={() => {
                      setFileMenuOpen(false)
                      openPicker(true)
                    }}
                  />
                  <div style={S_MENU.sep} />
                  <MenuItem
                    label="✕ Đóng bo đang xem"
                    disabled={!boardState.activeBoardId}
                    onClick={() => {
                      setFileMenuOpen(false)
                      if (boardState.activeBoardId) BoardDataModel.closeBoard(boardState.activeBoardId)
                    }}
                  />
                  <MenuItem
                    label="✕ Đóng tất cả bo"
                    hint={boardState.boards.length ? `${boardState.boards.length} bo đang mở` : undefined}
                    disabled={boardState.boards.length === 0}
                    onClick={() => {
                      setFileMenuOpen(false)
                      BoardDataModel.reset()
                    }}
                  />
                </div>
              </>
            )}
          </div>
          <span
            onClick={() => setShowSettings(true)}
            title="Cài đặt — công thức tính tiền"
            style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: '3px' }}
          >
            {isMobile ? '⚙' : 'Cài đặt'}
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '8px' }}>
          <button
            onClick={() => setShowQuotation(true)}
            title="Lập báo giá Excel từ bo đang mở"
            style={{
              backgroundColor: '#0ea5e9',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {isMobile ? '📄' : '📄 Báo giá'}
          </button>
          <button
            onClick={() => openPicker(false)}
            style={{
              backgroundColor: '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {isMobile ? '+ Mở' : '+ Open Gerber ZIP'}
          </button>
        </div>
      </div>

      {/* 2. SUB-TOOLBAR / TAB ROW */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '38px',
          backgroundColor: '#16181e',
          borderBottom: '1px solid #282b34',
          padding: '0 12px',
          gap: '12px',
          flexShrink: 0,
          overflowX: isMobile ? 'auto' : undefined,
        }}
      >
        {isMobile && (
          <button
            onClick={() => setDrawer((d) => (d === 'layers' ? null : 'layers'))}
            style={drawerBtn(drawer === 'layers')}
          >
            ☰ Layers
          </button>
        )}
        {/* Chế độ xem: hai công tắc, mỗi lần chỉ một nhóm sáng.
            CAM ⇄ 2 Mặt (bản vẽ phẳng) và 2D ⇄ 3D (ảnh thật). Bấm nhóm đang sáng thì
            gạt sang lựa chọn kia; bấm nhóm đang tắt thì chuyển sang nhóm đó ở lựa chọn đầu. */}
        {(() => {
          const v = boardState.activeView
          const groups = [
            { a: 'CAM', b: 'Both', aLabel: 'CAM', bLabel: '2 Mặt', tip: 'CAM ⇄ 2 Mặt (Top + Bot đã lật gương)' },
            { a: 'Real', b: '3D', aLabel: '2D', bLabel: '3D', tip: '2D ⇄ 3D' },
          ] as const
          return (
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              {groups.map((g) => {
                const on = v === g.a || v === g.b
                const chip = (lit: boolean): React.CSSProperties => ({
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  backgroundColor: lit ? '#3b82f6' : 'transparent',
                  color: lit ? '#ffffff' : '#94a3b8',
                })
                return (
                  <button
                    key={g.a}
                    title={g.tip}
                    onClick={() => BoardDataModel.setActiveView(!on ? g.a : v === g.a ? g.b : g.a)}
                    style={{
                      display: 'flex',
                      backgroundColor: '#0f172a',
                      borderRadius: '14px',
                      padding: '2px',
                      border: `1px solid ${on ? '#3b82f6' : '#334155'}`,
                      cursor: 'pointer',
                      opacity: on ? 1 : 0.75,
                    }}
                  >
                    <span style={chip(v === g.a)}>{g.aLabel}</span>
                    <span style={chip(v === g.b)}>{g.bLabel}</span>
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Tab các bo đang mở — thả nhiều ZIP thì mỗi ZIP một bo */}
        {boardState.boards.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: isMobile ? 'visible' : 'auto', flexShrink: 0 }}>
            {boardState.boards.map((b) => {
              const isActive = b.id === boardState.activeBoardId
              return (
                <div
                  key={b.id}
                  onClick={() => BoardDataModel.setActiveBoard(b.id)}
                  title={b.projectName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 6px 3px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    backgroundColor: isActive ? '#1e293b' : 'transparent',
                    color: isActive ? '#38bdf8' : '#94a3b8',
                    border: `1px solid ${isActive ? '#334155' : 'transparent'}`,
                  }}
                >
                  <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    📁 {b.projectName}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      BoardDataModel.closeBoard(b.id)
                    }}
                    title="Đóng bo này"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '0 2px',
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {isMobile && (
          <button
            onClick={() => setDrawer((d) => (d === 'info' ? null : 'info'))}
            style={{ ...drawerBtn(drawer === 'info'), marginLeft: 'auto' }}
          >
            ℹ Thông tin
          </button>
        )}
      </div>

      {/* 3. MAIN WORKSPACE: 3-COLUMN SPLIT */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {opening && <OpeningSkeleton name={opening.name} />}
        {/* ================= COLUMN 1: LEFT LAYERS PANEL ================= */}
        <div
          style={{
            width: isMobile ? 'min(300px, 85vw)' : '240px',
            backgroundColor: '#181a20',
            borderRight: '1px solid #282b34',
            display: isMobile && drawer !== 'layers' ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...(isMobile ? { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 40, boxShadow: '4px 0 16px rgba(0,0,0,0.5)' } : null),
          }}
        >
          {/* Layers header & tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #282b34',
              backgroundColor: '#14161b',
            }}
          >
            <div
              style={{
                flex: 1,
                padding: '8px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 600,
                color: '#38bdf8',
                borderBottom: '2px solid #38bdf8',
              }}
            >
              Layers ({boardState.layers.length})
            </div>
          </div>

          {/* Side Filter Tabs (All / Top / Bottom) */}
          {boardState.layers.length > 0 && (
            <div
              style={{
                display: 'flex',
                padding: '6px 8px',
                gap: '4px',
                backgroundColor: '#16181e',
                borderBottom: '1px solid #282b34',
              }}
            >
              {(['all', 'top', 'bottom'] as const).map((side) => {
                const isActive = boardState.sideFilter === side
                return (
                  <button
                    key={side}
                    onClick={() => BoardDataModel.setSideFilter(side)}
                    style={{
                      flex: 1,
                      backgroundColor: isActive ? '#2563eb' : '#1e293b',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 0',
                      fontSize: '11px',
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {side === 'all' ? 'All' : side === 'top' ? 'Top Side' : 'Bot Side'}
                  </button>
                )
              })}
            </div>
          )}

          {/* Quick Visibility Controls */}
          {boardState.layers.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 10px',
                borderBottom: '1px solid #282b34',
                fontSize: '11px',
                color: '#94a3b8',
                backgroundColor: '#121418',
              }}
            >
              <span
                style={{ cursor: 'pointer', color: '#38bdf8' }}
                onClick={() => BoardDataModel.setAllLayersVisible(true)}
              >
                ✓ All On
              </span>
              <span
                style={{ cursor: 'pointer', color: '#94a3b8' }}
                onClick={() => BoardDataModel.setAllLayersVisible(false)}
              >
                ✕ All Off
              </span>
            </div>
          )}

          {/* Layers List Table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
            {boardState.layers.length === 0 ? (
              <div style={{ padding: '20px 10px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                No layers loaded yet.
              </div>
            ) : (
              boardState.layers.map((layer, index) => {
                const isVisible = boardState.visibleLayers.has(layer.id)
                const isActive = boardState.activeLayerId === layer.id
                // Nhiều lớp cùng loại (3 file khoan, nhiều lớp inner…) sẽ có cùng
                // displayName → thêm phần tên riêng để phân biệt được trên panel.
                const isDuplicate =
                  boardState.layers.filter((l) => l.displayName === layer.displayName).length > 1
                const label =
                  isDuplicate && layer.shortName ? `${layer.displayName} · ${layer.shortName}` : layer.displayName
                return (
                  <div
                    key={layer.id}
                    onClick={() => BoardDataModel.setActiveLayer(layer.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '5px 8px',
                      borderRadius: '4px',
                      marginBottom: '2px',
                      backgroundColor: isActive
                        ? 'rgba(56, 189, 248, 0.12)'
                        : isVisible
                        ? 'rgba(255,255,255,0.03)'
                        : 'transparent',
                      border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                      opacity: isVisible ? 1 : 0.4,
                      fontSize: '12px',
                      gap: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.1s ease',
                    }}
                  >
                    {/* Index */}
                    <span style={{ width: '14px', color: '#64748b', fontSize: '11px', textAlign: 'right' }}>
                      {index + 1}
                    </span>

                    {/* Visibility Checkbox */}
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={(e) => {
                        e.stopPropagation()
                        BoardDataModel.toggleLayer(layer.id)
                      }}
                      style={{ cursor: 'pointer', accentColor: layer.color }}
                    />

                    {/* Ô màu — bấm để đổi màu lớp (áp dụng cho chế độ CAM 2D) */}
                    <label
                      title="Đổi màu lớp (chế độ CAM)"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '3px',
                        backgroundColor: layer.color,
                        border: '1px solid rgba(255,255,255,0.2)',
                        flexShrink: 0,
                        cursor: 'pointer',
                        display: 'block',
                        position: 'relative',
                      }}
                    >
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(e) => BoardDataModel.setLayerColor(layer.id, e.target.value)}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          opacity: 0,
                          width: '100%',
                          height: '100%',
                          padding: 0,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      />
                    </label>

                    {/* Display Name */}
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: isVisible ? 600 : 400,
                          color: isVisible ? '#f1f5f9' : '#64748b',
                        }}
                        title={`${layer.filename}  —  ${layer.type}/${layer.side}`}
                      >
                        {label}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={layer.filename}
                      >
                        {layer.shortName || layer.filename}
                      </span>
                    </div>

                    {/* Solo Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        BoardDataModel.soloLayer(layer.id)
                      }}
                      style={{
                        backgroundColor: 'transparent',
                        color: '#64748b',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '2px 4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        opacity: 0.7,
                      }}
                      title="Solo this layer (Chỉ xem lớp này)"
                    >
                      🎯
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Chẩn đoán: file bị bỏ qua / không đọc được — trước đây chỉ ghi console.warn
              nên người dùng không biết vì sao thiếu lớp. */}
          {(boardState.failedFiles.length > 0 || boardState.ignoredFiles.length > 0) && (
            <div
              style={{
                borderTop: '1px solid #282b34',
                padding: '6px 10px',
                fontSize: '10px',
                lineHeight: 1.5,
                color: '#64748b',
                backgroundColor: '#121418',
                maxHeight: '120px',
                overflowY: 'auto',
                flexShrink: 0,
              }}
            >
              {boardState.failedFiles.length > 0 && (
                <div style={{ color: '#f87171' }}>
                  ⚠ {boardState.failedFiles.length} file không đọc được:{' '}
                  <span title={boardState.failedFiles.map((f) => `${f.name}: ${f.reason}`).join(' | ')}>
                    {boardState.failedFiles.map((f) => f.name).join(', ')}
                  </span>
                </div>
              )}
              {boardState.ignoredFiles.length > 0 && (
                <div title={boardState.ignoredFiles.join(' | ')}>
                  ℹ {boardState.ignoredFiles.length} file phụ trợ đã bỏ qua (report / aperture / BOM)
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= COLUMN 2: CENTER CANVAS VIEW ================= */}
        <div
          onClick={() => drawer && setDrawer(null)}
          style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            backgroundColor: '#000000',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Empty State / Drop Zone Prompt */}
          {!boardState.isLoaded && !isLoading && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: isDraggingOver ? '2px dashed #38bdf8' : '2px dashed #282b34',
                margin: isMobile ? '8px' : '16px',
                padding: isMobile ? '0 12px' : undefined,
                textAlign: 'center',
                borderRadius: '8px',
                backgroundColor: isDraggingOver ? 'rgba(56, 189, 248, 0.05)' : '#0d0e12',
                cursor: 'pointer',
              }}
              onClick={() => openPicker(false)}
            >
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📁</div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#f1f5f9' }}>
                Drop Gerber ZIP file here
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Supports Altium, KiCad, Eagle, EasyEDA (.ZIP, .GTL, .GBL, .GKO, .DRL)
              </p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openPicker(false)
                  }}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Browse Files
                </button>
              </div>
            </div>
          )}

          {/* Một viewer duy nhất phục vụ cả CAM 2D / Real 2D / 3D.
              Chế độ "2 Mặt" dựng hai cảnh độc lập cạnh nhau: trái nhìn từ trên
              (Top), phải nhìn từ dưới lên nên là ảnh lật gương (Bot) — đúng quy
              ước bản vẽ lắp ráp của nhà máy. */}
          {boardState.isLoaded &&
            (boardState.activeView === 'Both' ? (
              <div
                ref={splitRef}
                style={{
                  flex: 1,
                  display: 'flex',
                  minHeight: 0,
                  position: 'relative',
                  // Khoảng trắng giữa hai khung: bỏ đường kẻ ngăn rồi thì lúc zoom vào,
                  // hai nền bo chạm nhau và đọc thành một khối liền. Dải nền cùng màu
                  // với nền canvas nên tách được mà không phải vẽ lại vạch ngăn.
                  gap: `${SPLIT_GAP_PX}px`,
                  backgroundColor: '#eeeeee',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Viewer2DWebGL
                    viewOverride="Real"
                    faceSide="top"
                    hideBadge
                    fitPadding={SPLIT_FIT_PADDING}
                    captureRef={captureTopRef}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Viewer2DWebGL
                    viewOverride="Real"
                    faceSide="bottom"
                    hideBadge
                    fitPadding={SPLIT_FIT_PADDING}
                    captureRef={captureBotRef}
                  />
                </div>

                {/* Chụp cả hai mặt đúng như đang nhìn (kể cả đang zoom) vào clipboard */}
                <button
                  onClick={captureTwoSides}
                  disabled={capturing}
                  title="Copy ảnh hai mặt bo vào clipboard, đúng khung đang nhìn (nét gấp đôi màn hình)"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    zIndex: 6,
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 6,
                    cursor: capturing ? 'wait' : 'pointer',
                    color: '#e2e8f0',
                    backgroundColor: 'rgba(15,23,42,0.85)',
                    border: '1px solid #334155',
                  }}
                >
                  {capturing ? 'Đang chụp…' : copied ? '✓ Đã copy' : '📋 Copy ảnh 2 mặt'}
                </button>

                {/* Nhãn kích thước nổi giữa hai khung, sát bo — thanh chạy hết chiều
                    ngang ở đáy trông rời rạc khi chụp màn hình. */}
                <BoardBadge
                  bounds={boardState.bounds}
                  name={boardState.projectName ?? ''}
                  layerCount={boardState.layerCount}
                  panel={splitSize}
                />
              </div>
            ) : (
              <Viewer2DWebGL />
            ))}

          {/* Error notice if any */}
          {errorMessage && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '13px',
                zIndex: 60,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {errorMessage}
            </div>
          )}
        </div>

        {/* ================= COLUMN 3: RIGHT PCB ANALYSIS PANEL ================= */}
        <div
          style={{
            width: isMobile ? 'min(340px, 92vw)' : '280px',
            backgroundColor: '#181a20',
            borderLeft: '1px solid #282b34',
            display: isMobile && drawer !== 'info' ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...(isMobile ? { position: 'absolute', top: 0, bottom: 0, right: 0, zIndex: 40, boxShadow: '-4px 0 16px rgba(0,0,0,0.5)' } : null),
          }}
        >
          {/* Tab Header */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #282b34',
              backgroundColor: '#14161b',
            }}
          >
            <div
              style={{
                flex: 1,
                padding: '8px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 600,
                color: '#38bdf8',
                borderBottom: '2px solid #38bdf8',
              }}
            >
              Thông tin bo
            </div>
          </div>

          {/* Thông tin bo + báo giá gộp một khối: kích thước và loại bo đọc từ Gerber
              đồng thời là đầu vào tính giá, nên không hiện hai lần ở hai bảng. */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            <PricingCard
              board={boardState}
              onOpenSettings={() => setShowSettings(true)}
              onPriceChange={handlePriceChange}
              onSendToQuotation={() => setShowQuotation(true)}
            />

            <div
              style={{
                marginTop: '14px',
                padding: '10px',
                borderRadius: '6px',
                border: '1px dashed #334155',
                color: '#64748b',
                fontSize: '11px',
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                Chưa làm
              </div>
              DFM rule check (trace/space, annular ring, drill-to-copper, board edge…),
              đo kích thước, ghép panel và xuất file — xem docs/plan.
            </div>
          </div>
        </div>
      </div>

      {showQuotation && (
        <QuotationPanel
          board={boardState}
          prices={prices}
          onClose={() => setShowQuotation(false)}
        />
      )}

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

const drawerBtn = (on: boolean): React.CSSProperties => ({
  flexShrink: 0,
  backgroundColor: on ? '#2563eb' : '#1e293b',
  color: on ? '#ffffff' : '#cbd5e1',
  border: '1px solid #334155',
  borderRadius: '14px',
  padding: '4px 10px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
})

const S_MENU: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    zIndex: 91,
    minWidth: 240,
    padding: 4,
    backgroundColor: '#1e2129',
    border: '1px solid #334155',
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  sep: { height: 1, margin: '4px 6px', backgroundColor: '#334155' },
}

const MenuItem: React.FC<{ label: string; hint?: string; disabled?: boolean; onClick: () => void }> = ({
  label,
  hint,
  disabled,
  onClick,
}) => {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        padding: '6px 10px',
        borderRadius: 4,
        fontSize: 13,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? '#475569' : '#e2e8f0',
        backgroundColor: hover && !disabled ? '#2563eb' : 'transparent',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label}</span>
      {hint && <span style={{ fontSize: 11, color: hover && !disabled ? '#dbeafe' : '#64748b' }}>{hint}</span>}
    </div>
  )
}

/**
 * Màn chờ khi mở file: phủ ĐỤC cả ba cột (danh sách lớp, khung xem, thông tin bo) bằng
 * khung xương nhấp nháy và tên file đang mở. Phủ mờ như trước thì bo cũ vẫn lộ ra sau.
 */
const OpeningSkeleton: React.FC<{ name: string }> = ({ name }) => {
  const bar = (w: string, h = 12): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: 4,
    background: '#262a34',
    animation: 'dqpcb-pulse 1.2s ease-in-out infinite',
  })
  const column = (width: number | string, rows: number): React.ReactNode => (
    <div style={{ width, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, borderRight: '1px solid #282b34' }}>
      <div style={bar('55%', 16)} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={bar(`${70 + ((i * 37) % 30)}%`)} />
      ))}
    </div>
  )
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', background: '#181a20' }}>
      <style>{'@keyframes dqpcb-pulse { 0%, 100% { opacity: .45 } 50% { opacity: 1 } }'}</style>
      {column(240, 12)}
      <div style={{ flex: 1, position: 'relative', background: '#0d0e12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...bar('60%', 0), height: '55%', borderRadius: 10 }} />
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            maxWidth: '80%',
            textAlign: 'center',
          }}
        >
          <span style={{ color: '#38bdf8', fontSize: 16, fontWeight: 600 }}>⏳ Đang mở file…</span>
          <span style={{ color: '#e2e8f0', fontSize: 13, wordBreak: 'break-all' }}>{name}</span>
        </div>
      </div>
      <div style={{ width: 280, borderLeft: '1px solid #282b34' }}>{column('100%', 10)}</div>
    </div>
  )
}

// Lề khi fit bo trong khung chia đôi — dùng chung cho viewer và nhãn kích thước
// để hai bên tính ra cùng một vị trí mép bo.
const SPLIT_FIT_PADDING = 1.4
/** Khoảng trắng giữa hai khung Top/Bot, cũng là khoảng trắng trong ảnh chụp. */
const SPLIT_GAP_PX = 28


/**
 * Nhãn kích thước + số lớp, bám ngay dưới mép bo.
 * Bo được fit vào khung theo cùng công thức của viewer: chiều cao thế giới nhìn thấy
 * là max(cao, rộng/tỉ-lệ-khung) × hệ số lề. Bo bè ngang sẽ fit theo chiều rộng nên chỉ
 * chiếm một dải mỏng giữa khung — neo nhãn vào đáy khung thì nó rơi rất xa bo.
 */
const BoardBadge: React.FC<{
  bounds: BoardState['bounds']
  name: string
  layerCount: number
  panel: { w: number; h: number } | null
}> = ({ bounds, name, layerCount, panel }) => {
  if (!bounds) return null

  let top = '88%'
  if (panel && panel.w > 0 && panel.h > 0) {
    const aspect = panel.w / 2 / panel.h // mỗi mặt chiếm nửa chiều ngang
    // Phải TRÙNG fitPadding truyền cho hai khung, nếu lệch thì nhãn rơi sai chỗ.
    const span = Math.max(bounds.heightMM, bounds.widthMM / aspect) * SPLIT_FIT_PADDING
    const frac = 0.5 + bounds.heightMM / 2 / span
    top = `calc(${Math.min(frac, 0.95) * 100}% + 20px)`
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 20px',
        borderRadius: 999,
        backgroundColor: 'rgba(15,23,42,0.9)',
        border: '1px solid #334155',
        boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        // To bằng nhãn trong ảnh copy trên màn rộng; cửa sổ hẹp thì co lại cho khỏi tràn
        // ra ngoài khung xem.
        fontSize: 'clamp(11px, 1.15vw, 16px)',
        fontWeight: 600,
        color: '#e2e8f0',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      {/* Cùng chữ với nhãn trong ảnh copy (captureBoard.ts) — nhìn sao chụp ra vậy. */}
      {name && (
        <>
          <span style={{ maxWidth: '22vw', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span style={{ color: '#475569' }}>|</span>
        </>
      )}
      <span>{layerCount} lớp</span>
      <span style={{ color: '#475569' }}>|</span>
      <span>
        {bounds.widthMM.toFixed(2)} x {bounds.heightMM.toFixed(2)} mm
      </span>
    </div>
  )
}
