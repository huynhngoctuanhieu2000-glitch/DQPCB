/**
 * gerber-reader — thư viện đọc và nhận diện bộ file Gerber/Excellon của DQPCB.
 *
 * Mọi thứ liên quan tới ĐỌC FILE (giải nén, nhận diện lớp, chuẩn hoá, dựng viền) nằm
 * trong thư mục này. Bổ sung nhận diện mới thì bổ sung ở đây, không rải ra UI/viewer.
 * Xem README.md cùng thư mục: bộ nhận diện nào là của DQPCB, cái nào là thư viện ngoài.
 *
 * Chỉ import từ file này; các file con là chi tiết bên trong, có thể đổi.
 */
export type { BoardParsedData, LayerMeta, ParsedGerberLayer } from './types'
export { GerberParser } from './reader'
export {
  LAYER_CHOICES,
  countExcellonHoles,
  drillPlatingOf,
  isAuxiliaryFile,
  isPartialDrillFile,
  isSlotOnlyDrill,
  layerKeyOf,
  matchLayer,
  shortenNames,
} from './identify'
export { ESTIMATED_OUTLINE_FILE, extractProfileGerber } from './outline'
export {
  OUTLINE_CUTOUT_MAX_RATIO,
  copperSamplePoints,
  countBoards,
  loopArea,
  loopPolygon,
  pointInPolygon,
  splitOutlineLoops,
} from './outlineLoops'
export { detectPanel, minDrill } from './panelDetect'
export type { MinDrill, PanelInfo } from './panelDetect'
