import type { ParsedGerberLayer, BoardParsedData } from '../core/GerberParser'

export interface BoardState {
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
  isLoaded: boolean
  activeView: 'CAM' | 'Real' | '3D'
  sideFilter: 'all' | 'top' | 'bottom'
}

let boardState: BoardState = {
  projectName: '',
  layers: [],
  visibleLayers: new Set(),
  activeLayerId: null,
  bounds: null,
  layerCount: 2,
  drillCount: 0,
  isLoaded: false,
  activeView: 'CAM',
  sideFilter: 'all',
}

type Listener = (state: BoardState) => void
const listeners: Set<Listener> = new Set()

export const BoardDataModel = {
  getState: () => boardState,

  loadBoardData: (data: BoardParsedData) => {
    boardState = {
      ...boardState,
      projectName: data.projectName,
      layers: data.layers,
      visibleLayers: new Set(data.layers.filter(l => l.type !== 'drawing').map(l => l.id)),
      activeLayerId: data.layers[0]?.id || null,
      bounds: data.bounds,
      layerCount: data.layerCount,
      drillCount: data.drillCount,
      isLoaded: true,
      sideFilter: 'all',
    }
    BoardDataModel.notify()
  },

  toggleLayer: (id: string) => {
    const newVisible = new Set(boardState.visibleLayers)
    if (newVisible.has(id)) {
      newVisible.delete(id)
    } else {
      newVisible.add(id)
    }
    boardState = { ...boardState, visibleLayers: newVisible }
    BoardDataModel.notify()
  },

  soloLayer: (id: string) => {
    const newVisible = new Set<string>([id])
    // Also include outline if exists for context
    const outline = boardState.layers.find(l => l.type === 'outline')
    if (outline && outline.id !== id) {
      newVisible.add(outline.id)
    }
    boardState = { ...boardState, visibleLayers: newVisible, activeLayerId: id }
    BoardDataModel.notify()
  },

  setSideFilter: (side: 'all' | 'top' | 'bottom') => {
    let newVisible: Set<string>
    if (side === 'all') {
      newVisible = new Set(boardState.layers.filter(l => l.type !== 'drawing').map(l => l.id))
    } else if (side === 'top') {
      newVisible = new Set(
        boardState.layers
          .filter(l => (l.side === 'top' || l.side === 'all') && l.type !== 'drawing')
          .map(l => l.id)
      )
    } else {
      newVisible = new Set(
        boardState.layers
          .filter(l => (l.side === 'bottom' || l.side === 'all') && l.type !== 'drawing')
          .map(l => l.id)
      )
    }
    boardState = { ...boardState, sideFilter: side, visibleLayers: newVisible }
    BoardDataModel.notify()
  },

  setAllLayersVisible: (visible: boolean) => {
    const newVisible = visible ? new Set(boardState.layers.map(l => l.id)) : new Set<string>()
    boardState = { ...boardState, visibleLayers: newVisible }
    BoardDataModel.notify()
  },

  setLayerColor: (id: string, color: string) => {
    const updated = boardState.layers.map(l => (l.id === id ? { ...l, color } : l))
    boardState = { ...boardState, layers: updated }
    BoardDataModel.notify()
  },

  setActiveView: (view: 'CAM' | 'Real' | '3D') => {
    boardState = { ...boardState, activeView: view }
    BoardDataModel.notify()
  },

  setActiveLayer: (id: string | null) => {
    boardState = { ...boardState, activeLayerId: id }
    BoardDataModel.notify()
  },

  reset: () => {
    boardState = {
      projectName: '',
      layers: [],
      visibleLayers: new Set(),
      activeLayerId: null,
      bounds: null,
      layerCount: 2,
      drillCount: 0,
      isLoaded: false,
      activeView: 'CAM',
      sideFilter: 'all',
    }
    BoardDataModel.notify()
  },

  subscribe: (listener: Listener) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  notify: () => {
    listeners.forEach(l => l(boardState))
  },
}
