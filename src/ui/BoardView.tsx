/**
 * Cột giữa: khung xem bo.
 *
 * - Chế độ "2 Mặt" dựng HAI cảnh độc lập: TOP nhìn từ trên, BOT nhìn từ dưới lên (ảnh lật
 *   gương) — đúng quy ước bản vẽ lắp ráp của nhà máy. Màn gọn cầm dọc thì xếp trên/dưới.
 * - Nút chụp ghép hai mặt thành một ảnh: máy tính copy vào clipboard, điện thoại mở bảng
 *   chia sẻ (Zalo…) hoặc lưu ảnh.
 *
 * Tách khỏi Layout.tsx cùng LayerPanel — xem đầu file đó.
 */
import React from 'react'
import type { BoardState } from '../models/BoardDataModel'
import { Viewer2DWebGL } from '../modules/viewer2d/Viewer2D.WebGL'
import type { CaptureFn } from '../modules/viewer2d/Viewer2D.WebGL'
import { Button } from './Button'
import { Icon } from './Icon'
import { C, RADIUS } from './theme'

/** Lề khi fit bo trong khung chia đôi — viewer và nhãn kích thước phải dùng CÙNG số. */
export const SPLIT_FIT_PADDING = 1.4
/** Khoảng trắng giữa hai khung Top/Bot, cũng là khoảng trắng trong ảnh chụp. */
export const SPLIT_GAP_PX = 28

export const BoardView: React.FC<{
  board: BoardState
  isMobile: boolean
  isLoading: boolean
  isDraggingOver: boolean
  /** Bảng trượt đang mở: chạm vào khung xem thì đóng nó. */
  drawer: 'layers' | 'info' | null
  onCloseDrawer: () => void
  onPickFiles: () => void
  /** Khung chia đôi: ref để đo, cờ xếp dọc, cỡ hiện tại (nhãn kích thước cần). */
  splitRef: React.RefObject<HTMLDivElement | null>
  splitStacked: boolean
  splitSize: { w: number; h: number } | null
  captureTopRef: React.RefObject<CaptureFn | null>
  captureBotRef: React.RefObject<CaptureFn | null>
  capturing: boolean
  copied: boolean
  onCapture: () => void
  errorMessage: string | null
}> = ({
  board: boardState,
  isMobile,
  isLoading,
  isDraggingOver,
  drawer,
  onCloseDrawer,
  onPickFiles,
  splitRef,
  splitStacked,
  splitSize,
  captureTopRef,
  captureBotRef,
  capturing,
  copied,
  onCapture,
  errorMessage,
}) => (
    <div
      onClick={() => drawer && onCloseDrawer()}
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
          onClick={onPickFiles}
        >
          <div style={{ marginBottom: '12px', color: '#38bdf8' }}><Icon name="folder" size={48} /></div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#f1f5f9' }}>
            Thả file Gerber vào đây
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
            Altium, KiCad, Eagle, EasyEDA — file .ZIP, .RAR hoặc file lẻ (.GTL, .GBL, .GKO, .DRL…)
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPickFiles()
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
              Chọn file…
            </button>
          </div>
        </div>
      )}

      {/* Một viewer duy nhất phục vụ cả CAM 2D / Real 2D / 3D.
          Chế độ "2 Mặt" dựng hai cảnh độc lập cạnh nhau: trái nhìn từ trên
          (Top), phải nhìn từ dưới lên nên là ảnh lật gương (Bot) — đúng quy
          ước bản vẽ lắp ráp của nhà máy.
          Màn gọn đang dựng đứng (điện thoại/máy tính bảng cầm dọc): xếp TOP trên, BOT
          dưới — chia trái/phải thì mỗi mặt chỉ rộng ~174px, bỏ trống 3/4 chiều cao.
          Ảnh "Chụp" vẫn ghép trái/phải như cũ. */}
      {boardState.isLoaded &&
        (boardState.activeView === 'Both' ? (
          <div
            ref={splitRef}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: splitStacked ? 'column' : 'row',
              minHeight: 0,
              position: 'relative',
              // Khoảng trắng giữa hai khung: bỏ đường kẻ ngăn rồi thì lúc zoom vào,
              // hai nền bo chạm nhau và đọc thành một khối liền. Dải nền cùng màu
              // với nền canvas nên tách được mà không phải vẽ lại vạch ngăn.
              gap: `${SPLIT_GAP_PX}px`,
              backgroundColor: '#eeeeee',
            }}
          >
            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <Viewer2DWebGL
                viewOverride="Real"
                faceSide="top"
                hideBadge
                fitPadding={SPLIT_FIT_PADDING}
                captureRef={captureTopRef}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <Viewer2DWebGL
                viewOverride="Real"
                faceSide="bottom"
                hideBadge
                fitPadding={SPLIT_FIT_PADDING}
                captureRef={captureBotRef}
              />
            </div>

            {/* Chụp cả hai mặt đúng như đang nhìn (kể cả đang zoom) vào clipboard */}
            <Button
              icon="camera"
              onClick={onCapture}
              disabled={capturing}
              title={
                isMobile
                  ? 'Chụp ảnh hai mặt bo rồi gửi (Zalo…) hoặc lưu ảnh'
                  : 'Copy ảnh hai mặt bo vào clipboard, đúng khung đang nhìn (nét gấp đôi màn hình)'
              }
              aria-label="Chụp ảnh hai mặt"
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 6,
                borderRadius: RADIUS.md,
                cursor: capturing ? 'wait' : 'pointer',
                // Nền đục trên nền ảnh bo sáng, không dùng nền panel.
                backgroundColor: 'rgba(15,23,42,0.85)',
                borderColor: C.border,
              }}
            >
              {/* Có chữ bên cạnh icon: điện thoại không rê chuột xem chú thích được. */}
              {capturing ? 'Đang chụp…' : copied ? (isMobile ? 'Xong' : 'Đã copy') : 'Chụp'}
            </Button>

            {/* Nhãn kích thước nổi giữa hai khung, sát bo — thanh chạy hết chiều
                ngang ở đáy trông rời rạc khi chụp màn hình. */}
            <BoardBadge
              bounds={boardState.bounds}
              name={boardState.projectName ?? ''}
              layerCount={boardState.layersOverride ?? boardState.layerCount}
              panel={splitSize}
              stacked={splitStacked}
            />
          </div>
        ) : (
          // Lọc "Bot Side" ở 2D/3D: phải NHÌN TỪ DƯỚI LÊN (lật gương như khung Bot của
          // 2 Mặt). Chỉ ẩn lớp mặt trên thì camera vẫn nhìn từ trên, lõi bo + mask che
          // hết đồng/lụa mặt dưới — bo FRIWO 55807.931-90FE chỉ thấy mảng xanh với lỗ.
          // CAM giữ nhìn từ trên: đó là chỗ soi file đúng toạ độ gốc.
          <Viewer2DWebGL
            faceSide={boardState.sideFilter === 'bottom' && boardState.activeView !== 'CAM' ? 'bottom' : 'top'}
          />
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
)

const BoardBadge: React.FC<{
  bounds: BoardState['bounds']
  name: string
  layerCount: number
  panel: { w: number; h: number } | null
  /** TOP trên / BOT dưới: nhãn nằm ở khe giữa hai mặt. */
  stacked?: boolean
}> = ({ bounds, name, layerCount, panel, stacked }) => {
/**
 * Nhãn kích thước + số lớp, bám ngay dưới mép bo.
 * Bo được fit vào khung theo cùng công thức của viewer: chiều cao thế giới nhìn thấy
 * là max(cao, rộng/tỉ-lệ-khung) × hệ số lề. Bo bè ngang sẽ fit theo chiều rộng nên chỉ
 * chiếm một dải mỏng giữa khung — neo nhãn vào đáy khung thì nó rơi rất xa bo.
 */
  if (!bounds) return null

  let top = '88%'
  if (stacked) {
    top = '50%'
  } else if (panel && panel.w > 0 && panel.h > 0) {
    const aspect = panel.w / 2 / panel.h // mỗi mặt chiếm nửa chiều ngang
    // Phải TRÙNG fitPadding truyền cho hai khung, nếu lệch thì nhãn rơi sai chỗ.
    const span = Math.max(bounds.heightMM, bounds.widthMM / aspect) * SPLIT_FIT_PADDING
    const frac = 0.5 + bounds.heightMM / 2 / span
    // Kẹp trong khung, chừa 96px dưới cho nút "Vừa khung" (cao 32–40px, cách đáy 10px) và
    // chính nhãn — khung thấp (điện thoại xoay ngang) thì nhãn từng lòi khỏi mép dưới và
    // đè lên nút.
    top = `min(calc(${Math.min(frac, 0.95) * 100}% + 20px), calc(100% - 96px))`
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top,
        transform: stacked ? 'translate(-50%, -50%)' : 'translateX(-50%)',
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
        maxWidth: 'calc(100% - 16px)',
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
