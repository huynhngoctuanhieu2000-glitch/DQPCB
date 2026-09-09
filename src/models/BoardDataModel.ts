import type { ParsedGerberLayer, BoardParsedData } from '../core/GerberParser'

/** Dữ liệu riêng của MỘT bo. Mở nhiều file thì có nhiều cái như thế này. */
export interface Board {
  id: string
  projectName: string
  layers: ParsedGerberLayer[]
  visibleLayers: Set<string>
  activeLayerId: string | null
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    widthMM: number
    heightMM: number
  } | null
  layerCount: number
  drillCount: number
  sideFilter: 'all' | 'top' | 'bottom'
  /** Màu soldermask người dùng chọn — quyết định màu bo ở chế độ Real/3D/2 Mặt */
  maskColor: string
  /** File phụ trợ bị bỏ qua khi đọc (report, aperture list, BOM…) */
  ignoredFiles: string[]
  /** File Gerber/Drill mà parser không đọc được */
  failedFiles: { name: string; reason: string }[]
  /**
   * Thư mục chứa file gerber trên đĩa. Chỉ có khi chạy trong Electron.
   * Dùng để đoán tên khách và để mặc định chỗ lưu báo giá về đúng thư mục đó.
   */
  sourceDir: string
}

/**
 * Trạng thái app.
 *
 * Các trường của bo ĐANG CHỌN được trải thẳng lên đây, nên mọi chỗ đang đọc
 * `state.layers` / `state.bounds`… vẫn chạy nguyên như hồi còn một bo. Muốn biết
 * có những bo nào thì đọc `boards`.
 */
export interface BoardState extends Board {
  boards: Board[]
  activeBoardId: string | null
  activeView: 'CAM' | 'Real' | '3D' | 'Both'
  isLoaded: boolean
}

const DEFAULT_MASK_COLOR = '#0f4f26'

/** Bo rỗng dùng khi chưa mở file nào — để các trường phẳng luôn có giá trị. */
const emptyBoard = (): Board => ({
  id: '',
  projectName: '',
  layers: [],
  visibleLayers: new Set(),
  activeLayerId: null,
  bounds: null,
  layerCount: 2,
  drillCount: 0,
  sideFilter: 'all',
  maskColor: DEFAULT_MASK_COLOR,
  ignoredFiles: [],
  failedFiles: [],
  sourceDir: '',
})

let boards: Board[] = []
let activeBoardId: string | null = null
let activeView: BoardState['activeView'] = 'CAM'
/** Màu vừa chọn gần nhất — bo mở sau kế thừa, khỏi phải chọn lại từng cái. */
let lastMaskColor = DEFAULT_MASK_COLOR

let boardSeq = 0
const nextBoardId = () => `board-${++boardSeq}`

const compute = (): BoardState => {
  const active = boards.find((b) => b.id === activeBoardId)
  return {
    ...(active ?? emptyBoard()),
    boards,
    activeBoardId,
    activeView,
    isLoaded: Boolean(active),
  }
}

let snapshot: BoardState = compute()

type Listener = (state: BoardState) => void
const listeners: Set<Listener> = new Set()

const commit = () => {
  snapshot = compute()
  listeners.forEach((l) => l(snapshot))
}

/** Sửa bo đang chọn; không có bo nào thì không làm gì. */
const updateActive = (fn: (board: Board) => Board) => {
  if (!activeBoardId) return
  boards = boards.map((b) => (b.id === activeBoardId ? fn(b) : b))
  commit()
}

const toBoard = (data: BoardParsedData, sourceDir = ''): Board => ({
  id: nextBoardId(),
  projectName: data.projectName,
  layers: data.layers,
  visibleLayers: new Set(data.layers.filter((l) => l.type !== 'documentation').map((l) => l.id)),
  activeLayerId: data.layers[0]?.id || null,
  bounds: data.bounds,
  layerCount: data.layerCount,
  drillCount: data.drillCount,
  sideFilter: 'all',
  maskColor: lastMaskColor,
  ignoredFiles: data.ignoredFiles ?? [],
  failedFiles: data.failedFiles ?? [],
  sourceDir,
})

export const BoardDataModel = {
  getState: () => snapshot,

  /**
   * Mở thêm bo (không đóng bo cũ) và chuyển sang bo cuối cùng vừa mở.
   * `sourceDirs` xếp cùng thứ tự với `list`, rỗng nếu không biết đường dẫn.
   */
  addBoards: (list: BoardParsedData[], sourceDirs: string[] = []) => {
    if (list.length === 0) return
    const added = list.map((data, i) => toBoard(data, sourceDirs[i] ?? ''))
    boards = [...boards, ...added]
    activeBoardId = added[added.length - 1].id
    commit()
  },

  setActiveBoard: (id: string) => {
    if (!boards.some((b) => b.id === id)) return
    activeBoardId = id
    commit()
  },

  closeBoard: (id: string) => {
    const index = boards.findIndex((b) => b.id === id)
    if (index === -1) return
    boards = boards.filter((b) => b.id !== id)
    if (activeBoardId === id) {
      // Chuyển sang bo bên cạnh, ưu tiên bo phía trước.
      activeBoardId = (boards[index - 1] ?? boards[index] ?? null)?.id ?? null
    }
    commit()
  },

  toggleLayer: (id: string) =>
    updateActive((board) => {
      const visible = new Set(board.visibleLayers)
      if (visible.has(id)) visible.delete(id)
      else visible.add(id)
      return { ...board, visibleLayers: visible }
    }),

  soloLayer: (id: string) =>
    updateActive((board) => {
      const visible = new Set<string>([id])
      // Also include outline if exists for context
      const outline = board.layers.find((l) => l.type === 'outline')
      if (outline && outline.id !== id) visible.add(outline.id)
      return { ...board, visibleLayers: visible, activeLayerId: id }
    }),

  setSideFilter: (side: Board['sideFilter']) =>
    updateActive((board) => {
      let visible: Set<string>
      if (side === 'all') {
        visible = new Set(
          board.layers.filter((l) => l.type !== 'documentation').map((l) => l.id)
        )
      } else if (side === 'top') {
        visible = new Set(
          board.layers
            .filter((l) => (l.side === 'top' || l.side === 'all') && l.type !== 'documentation')
            .map((l) => l.id)
        )
      } else {
        visible = new Set(
          board.layers
            .filter((l) => (l.side === 'bottom' || l.side === 'all') && l.type !== 'documentation')
            .map((l) => l.id)
        )
      }
      return { ...board, sideFilter: side, visibleLayers: visible }
    }),

  setAllLayersVisible: (visible: boolean) =>
    updateActive((board) => ({
      ...board,
      visibleLayers: visible ? new Set(board.layers.map((l) => l.id)) : new Set<string>(),
    })),

  setLayerColor: (id: string, color: string) =>
    updateActive((board) => ({
      ...board,
      layers: board.layers.map((l) => (l.id === id ? { ...l, color } : l)),
    })),

  setMaskColor: (color: string) => {
    lastMaskColor = color
    updateActive((board) => ({ ...board, maskColor: color }))
  },

  setActiveView: (view: BoardState['activeView']) => {
    activeView = view
    commit()
  },

  setActiveLayer: (id: string | null) => updateActive((board) => ({ ...board, activeLayerId: id })),

  /** Đóng hết, về màn hình trống. */
  reset: () => {
    boards = []
    activeBoardId = null
    activeView = 'CAM'
    commit()
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  notify: commit,
}
