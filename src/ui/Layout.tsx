import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BOARD_RENDERED_EVENT, isBoardBuilt } from '../modules/viewer2d/Viewer2D.WebGL'
import type { CaptureFn } from '../modules/viewer2d/Viewer2D.WebGL'
import { composeTwoSides, copyPng } from '../modules/viewer2d/captureBoard'
import { canShareType, shareOrDownload } from '../modules/quotation/exportImage'
import { BoardDataModel } from '../models/BoardDataModel'
import { GerberParser } from '../lib/gerber-reader'
import { QuotationPanel } from '../modules/quotation/QuotationPanel'
import type { QuotationSeed } from '../modules/quotation/QuotationPanel'
import { PricingCard } from '../modules/pricing/PricingCard'
import { SettingsPanel } from '../modules/settings/SettingsPanel'
import { useIsMobile } from './useIsMobile'
import { Button } from './Button'
import { LayerPanel } from './LayerPanel'
import { BoardView, SPLIT_GAP_PX } from './BoardView'
import { Toolbars } from './Toolbars'
import { C, FS } from './theme'
import { UndoToast, showUndo } from './undo'
import { useBackToClose } from './useBackToClose'

export const Layout: React.FC = () => {
  const isMobile = useIsMobile()
  const [drawer, setDrawer] = useState<'layers' | 'info' | null>(null)
  // Nút Back / vuốt lùi của điện thoại đóng bảng trượt thay vì rời trang.
  useBackToClose(isMobile && drawer !== null, () => setDrawer(null))
  const [boardState, setBoardState] = useState(BoardDataModel.getState())
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  /**
   * Màn chờ mở file. Tắt khi viewer báo ĐÚNG bo mới đã dựng xong (BOARD_RENDERED_EVENT),
   * không phải lúc đọc file xong: giữa hai mốc đó khung xem vẫn còn bo cũ trong khi
   * cột bên đã là thông tin bo mới — đang mở nhiều bo là dễ đọc nhầm bo này ra bo kia.
   */
  const [opening, setOpening] = useState<{ name: string; waitFor: string | null; label?: string } | null>(null)

  /**
   * Chuyển sang bo khác. Bo đã có hình dựng sẵn (đã xem, hoặc dựng ở nền) thì hiện ngay.
   * Chưa có thì bật màn chờ TRƯỚC rồi mới chuyển: dựng hình chạy đồng bộ, chặn cả giao
   * diện 1–3 s — không có màn chờ thì khung đứng im với bo cũ, người dùng tưởng treo.
   */
  /** Đóng một bo, kèm thanh Hoàn tác — nút ✕ nằm sát tên bo, bấm nhầm là chuyện thường. */
  /** Đóng hết: hỏi trước (thao tác lớn, hiếm khi làm) rồi vẫn cho Hoàn tác. */
  const closeAllBoardsWithUndo = () => {
    const n = boardState.boards.length
    if (n === 0 || !window.confirm(`Đóng cả ${n} bo đang mở?`)) return
    const closed = BoardDataModel.reset()
    showUndo(`Đã đóng ${n} bo`, () => BoardDataModel.restoreBoards(closed))
  }

  const closeBoardWithUndo = (id: string) => {
    const closed = BoardDataModel.closeBoard(id)
    if (closed) showUndo(`Đã đóng ${closed.board.projectName}`, () => BoardDataModel.restoreBoards([closed]))
  }

  const switchBoard = (id: string) => {
    const s = BoardDataModel.getState()
    const target = s.boards.find((b) => b.id === id)
    if (!target || id === s.activeBoardId) return
    if (isBoardBuilt(target, s.activeView)) {
      BoardDataModel.setActiveBoard(id)
      return
    }
    setOpening({ name: target.projectName, waitFor: id, label: 'Đang dựng hình…' })
    // Cho màn chờ kịp vẽ lên màn hình trước khi luồng bị chiếm để dựng.
    window.setTimeout(() => BoardDataModel.setActiveBoard(id), 40)
  }
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Thông báo lỗi tự tắt sau 6 giây: trước nó nằm mãi giữa khung xem, đè lên nhãn BOT.
  useEffect(() => {
    if (!errorMessage) return
    const t = window.setTimeout(() => setErrorMessage(null), 6000)
    return () => window.clearTimeout(t)
  }, [errorMessage])
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
  /** "2 Mặt" xếp TOP trên / BOT dưới: màn gọn và khung đang dựng đứng (cao > rộng). */
  const splitStacked = isMobile && !!splitSize && splitSize.h > splitSize.w
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
        layerCount: boardState.layersOverride ?? boardState.layerCount,
        widthMM: boardState.bounds.widthMM,
        heightMM: boardState.bounds.heightMM,
      })
      // Điện thoại / máy tính bảng: người dùng cần GỬI (Zalo) hoặc LƯU ảnh, không phải
      // dán — mà Safari iPhone còn hạn chế ghi ảnh vào clipboard. Mở bảng chia sẻ với file
      // PNG; máy không có bảng chia sẻ thì tải ảnh về. Máy tính giữ copy như cũ.
      if (isMobile) {
        const blob = await new Promise<Blob | null>((res) => img.toBlob(res, 'image/png'))
        if (!blob) throw new Error('Không tạo được ảnh')
        const name = `${(boardState.projectName || 'bo').replace(/[\\/:*?"<>|]+/g, '_')} - 2 mat.png`
        const how = await shareOrDownload(blob, name, canShareType('image/png', 'png'))
        if (how === 'canceled') return
        setCopied(true)
      } else {
        await copyPng(img)
        setCopied(true)
      }
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
      // Bản web: hộp chọn của trình duyệt KHÔNG theo thư mục vừa mở. Chrome/Edge có File
      // System Access API — cùng một `id` thì trình duyệt tự mở lại thư mục lần trước.
      // Trình duyệt khác (Firefox, Safari, điện thoại) chưa có → input như cũ.
      const w = window as unknown as {
        showOpenFilePicker?: (o: object) => Promise<{ getFile(): Promise<File> }[]>
        showDirectoryPicker?: (o: object) => Promise<any>
      }
      try {
        if (!folder && w.showOpenFilePicker) {
          const handles = await w.showOpenFilePicker({ id: 'dqpcb-gerber', multiple: true })
          const files = await Promise.all(handles.map((h) => h.getFile()))
          if (files.length) processFiles(files)
          return
        }
        if (folder && w.showDirectoryPicker) {
          const dir = await w.showDirectoryPicker({ id: 'dqpcb-gerber' })
          const files: File[] = []
          for await (const entry of dir.values()) if (entry.kind === 'file') files.push(await entry.getFile())
          if (files.length) processFiles(files)
          return
        }
      } catch (err: any) {
        // Bấm Huỷ thì trình duyệt ném AbortError — không phải lỗi.
        if (err?.name === 'AbortError') return
        // Bị chặn (iframe, chính sách) thì rơi xuống input.
      }
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
      const dirs = new Map(res.files.map((f) => [f.name, f.path.replace(/[\\/][^\\/]*$/, '')]))
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

  /** Nút + mở thêm bo, đặt cạnh dãy tab (máy tính) hoặc cạnh ô chọn bo (điện thoại). */
  const addBoardBtn = (
    <Button
      size="icon"
      variant="ghost"
      icon="plus"
      onClick={() => openPicker(false)}
      title="Mở thêm file Gerber (ZIP, RAR hoặc file lẻ)"
      aria-label="Mở thêm bo"
      style={{ flexShrink: 0, borderStyle: 'dashed', borderColor: C.border }}
    />
  )

  /** Đầu bảng trượt trên điện thoại: hai tab Lớp / Thông tin, cả hai ngăn dùng chung. */
  const sheetTabs = (
    <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #282b34', backgroundColor: '#14161b', flexShrink: 0 }}>
      {(
        [
          ['layers', `Lớp (${boardState.layers.length})`],
          ['info', 'Thông tin bo'],
        ] as const
      ).map(([key, label]) => {
        const on = drawer === key
        return (
          <div
            key={key}
            onClick={() => setDrawer(key)}
            role="tab"
            aria-selected={on}
            style={{
              flex: 1,
              padding: '10px 8px',
              textAlign: 'center',
              fontSize: FS.md,
              fontWeight: 600,
              color: on ? C.accent : C.muted,
              borderBottom: `2px solid ${on ? C.accent : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            {label}
          </div>
        )
      })}
      {/* Đóng ngay trên bảng: nút "✕ Đóng" ở thanh trên cùng xa ngón tay khi bảng đang
          chiếm nửa dưới màn hình. Giữ cả hai. */}
      <Button
        size="icon"
        variant="ghost"
        icon="x"
        onClick={() => setDrawer(null)}
        title="Đóng bảng"
        aria-label="Đóng bảng"
        style={{ minWidth: 48, borderRadius: 0, borderLeftColor: C.line, color: C.text }}
      />
    </div>
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        width: '100vw',
        // Web app chạy toàn màn hình trên iPhone: nền tràn dưới thanh trạng thái, nhưng
        // nội dung phải lùi xuống, không thì hàng nút đầu tiên nằm dưới đồng hồ, bấm không được.
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
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

      <Toolbars
        board={boardState}
        isMobile={isMobile}
        drawer={drawer}
        setDrawer={setDrawer}
        fileMenuOpen={fileMenuOpen}
        setFileMenuOpen={setFileMenuOpen}
        onPickFiles={openPicker}
        onCloseBoard={closeBoardWithUndo}
        onCloseAllBoards={closeAllBoardsWithUndo}
        onSwitchBoard={switchBoard}
        onOpenQuotation={() => setShowQuotation(true)}
        onOpenSettings={() => setShowSettings(true)}
        addBoardBtn={addBoardBtn}
      />

      {/* 3. MAIN WORKSPACE: 3-COLUMN SPLIT */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {opening && <OpeningSkeleton name={opening.name} label={opening.label} />}
        {/* ================= COLUMN 1: LEFT LAYERS PANEL ================= */}
        <LayerPanel
          board={boardState}
          isMobile={isMobile}
          drawer={drawer}
          tabs={sheetTabs}
          sheetStyle={SHEET}
        />

        {/* ================= COLUMN 2: CENTER CANVAS VIEW ================= */}
        <BoardView
          board={boardState}
          isMobile={isMobile}
          isLoading={isLoading}
          isDraggingOver={isDraggingOver}
          drawer={drawer}
          onCloseDrawer={() => setDrawer(null)}
          onPickFiles={() => openPicker(false)}
          splitRef={splitRef}
          splitStacked={splitStacked}
          splitSize={splitSize}
          captureTopRef={captureTopRef}
          captureBotRef={captureBotRef}
          capturing={capturing}
          copied={copied}
          onCapture={captureTwoSides}
          errorMessage={errorMessage}
        />

        {/* ================= COLUMN 3: RIGHT PCB ANALYSIS PANEL ================= */}
        <div
          style={{
            width: '280px',
            backgroundColor: '#181a20',
            borderLeft: '1px solid #282b34',
            display: isMobile && drawer !== 'info' ? 'none' : 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            ...(isMobile ? SHEET : null),
          }}
        >
          {/* Tab Header */}
          {isMobile ? sheetTabs : (
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
          )}

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

      <UndoToast />
    </div>
  )
}

/** Khoá cách đọc (reader.ts, drillReadings) → chữ cho người đọc: "lz35" → "3.5", "div4" → "4 số lẻ". */

/** Bảng trượt từ đáy trên điện thoại: full bề ngang, cao 72% để vẫn thấy một phần bo. */
const SHEET: React.CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 0, height: '72%', width: '100%', zIndex: 40, borderTop: '1px solid #334155', borderRadius: '12px 12px 0 0', boxShadow: '0 -6px 20px rgba(0,0,0,0.55)' }


/**
 * Ô chọn (chế độ xem, chọn bo) trên màn gọn: vẽ GIỐNG nút chip bên cạnh — iOS tự vẽ
 * select to/đậm/mũi tên riêng nên phải tắt appearance và tự vẽ mũi tên.
 */


/** Nút của thanh trên cùng: chữ phụ trong suốt, nút phụ viền, nút chính nền đặc. */

/**
 * Màn chờ khi mở file: phủ ĐỤC cả ba cột (danh sách lớp, khung xem, thông tin bo) bằng
 * khung xương nhấp nháy và tên file đang mở. Phủ mờ như trước thì bo cũ vẫn lộ ra sau.
 */
const OpeningSkeleton: React.FC<{ name: string; label?: string }> = ({ name, label = 'Đang mở file…' }) => {
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
          <span style={{ color: '#38bdf8', fontSize: 16, fontWeight: 600 }}>⏳ {label}</span>
          <span style={{ color: '#e2e8f0', fontSize: 13, wordBreak: 'break-all' }}>{name}</span>
        </div>
      </div>
      <div style={{ width: 280, borderLeft: '1px solid #282b34' }}>{column('100%', 10)}</div>
    </div>
  )
}




/**
 * Chọn tay loại của một lớp khi app nhận diện sai (file khoan đuôi lạ, viền nằm trong
 * file tài liệu…). Đổi xong cả bộ file được đọc lại theo loại mới.
 */
