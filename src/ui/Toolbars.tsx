/**
 * Hai thanh công cụ trên cùng:
 * - Thanh 1: menu Tệp, Cài đặt, Báo giá, Mở Gerber.
 * - Thanh 2: chọn chế độ xem (CAM / 2 Mặt / 2D / 3D), dãy tab bo đang mở, nút mở thêm bo,
 *   và trên màn gọn là nút mở bảng trượt Lớp · Thông tin.
 *
 * Màn gọn mà thấp (điện thoại xoay ngang) thì CSS `.bars` (index.css) gộp hai thanh thành
 * một hàng. Tách khỏi Layout.tsx cùng LayerPanel/BoardView — xem đầu LayerPanel.tsx.
 */
import React, { useState } from 'react'
import { BoardDataModel, type BoardState } from '../models/BoardDataModel'
import { Button } from './Button'
import { Icon } from './Icon'
import { C, FS } from './theme'

export const Toolbars: React.FC<{
  board: BoardState
  isMobile: boolean
  drawer: 'layers' | 'info' | null
  setDrawer: React.Dispatch<React.SetStateAction<'layers' | 'info' | null>>
  fileMenuOpen: boolean
  setFileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
  onPickFiles: (folder: boolean) => void
  onCloseBoard: (id: string) => void
  onCloseAllBoards: () => void
  onSwitchBoard: (id: string) => void
  onOpenQuotation: () => void
  onOpenSettings: () => void
  /** Nút + mở thêm bo (Layout dựng sẵn vì cũng dùng chỗ khác). */
  addBoardBtn: React.ReactNode
}> = ({
  board: boardState,
  isMobile,
  drawer,
  setDrawer,
  fileMenuOpen,
  setFileMenuOpen,
  onPickFiles,
  onCloseBoard,
  onCloseAllBoards,
  onSwitchBoard,
  onOpenQuotation,
  onOpenSettings,
  addBoardBtn,
}) => (
  // Khối bọc: bình thường display:contents (như không có); màn gọn mà thấp (điện thoại
  // xoay ngang) thì CSS .bars gộp hai thanh thành một hàng — hai thanh chồng nhau ăn
  // 100/375px chiều cao.
  <div className="bars">
    {/* 1. TOP MENU BAR */}
    <div
      className="tap-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: isMobile ? '48px' : '34px',
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
          <Button
            variant="ghost"
            aria-haspopup="menu"
            aria-expanded={fileMenuOpen}
            style={{ backgroundColor: fileMenuOpen ? C.border : 'transparent', color: C.text }}
            onClick={() => setFileMenuOpen((v) => !v)}
          >
            Tệp <Icon name="chevronDown" size={13} />
          </Button>
          {fileMenuOpen && (
            <>
              {/* Bấm ra ngoài là đóng menu */}
              <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setFileMenuOpen(false)} />
              <div style={S_MENU.panel}>
                <MenuItem
                  label="Mở file Gerber…"
                  hint="ZIP, RAR hoặc file lẻ"
                  onClick={() => {
                    setFileMenuOpen(false)
                    onPickFiles(false)
                  }}
                />
                <MenuItem
                  label="Mở thư mục…"
                  hint="Cả thư mục Gerber chưa nén"
                  onClick={() => {
                    setFileMenuOpen(false)
                    onPickFiles(true)
                  }}
                />
                <div style={S_MENU.sep} />
                <MenuItem
                  label="Đóng bo đang xem"
                  disabled={!boardState.activeBoardId}
                  onClick={() => {
                    setFileMenuOpen(false)
                    if (boardState.activeBoardId) onCloseBoard(boardState.activeBoardId)
                  }}
                />
                <MenuItem
                  label="Đóng tất cả bo"
                  danger
                  hint={boardState.boards.length ? `${boardState.boards.length} bo đang mở` : undefined}
                  disabled={boardState.boards.length === 0}
                  onClick={() => {
                    setFileMenuOpen(false)
                    onCloseAllBoards()
                  }}
                />
              </div>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size={isMobile ? 'icon' : 'md'}
          icon={isMobile ? 'settings' : undefined}
          onClick={() => onOpenSettings()}
          title="Cài đặt — công thức tính tiền"
          aria-label="Cài đặt"
          style={{ color: C.text }}
        >
          {isMobile ? null : 'Cài đặt'}
        </Button>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '8px' }}>
        {/* Một nút chính duy nhất: Mở Gerber (nền đặc). Báo giá là nút phụ (viền) —
            hai nút đặc màu cạnh nhau thì mắt không biết đâu là việc chính. */}
        <Button
          icon="file"
          size={isMobile ? 'icon' : 'md'}
          onClick={() => onOpenQuotation()}
          title="Lập báo giá Excel từ bo đang mở"
          aria-label="Báo giá"
        >
          {isMobile ? null : 'Báo giá'}
        </Button>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => onPickFiles(false)}
          title="Mở file Gerber (ZIP, RAR hoặc file lẻ)"
          style={{ backgroundColor: C.successBg }}
        >
          {isMobile ? 'Mở' : 'Mở Gerber'}
        </Button>
      </div>
    </div>

    {/* 2. SUB-TOOLBAR / TAB ROW */}
    <div
      className="tap-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: isMobile ? '52px' : '40px',
        backgroundColor: '#16181e',
        borderBottom: '1px solid #282b34',
        padding: '0 12px',
        gap: '12px',
        flexShrink: 0,
        ...(isMobile ? { padding: '0 8px', gap: '8px' } : null),
      }}
    >
      {/* Chế độ xem: hai công tắc, mỗi lần chỉ một nhóm sáng.
          CAM ⇄ 2 Mặt (bản vẽ phẳng) và 2D ⇄ 3D (ảnh thật). Bấm nhóm đang sáng thì
          gạt sang lựa chọn kia; bấm nhóm đang tắt thì chuyển sang nhóm đó ở lựa chọn đầu. */}
      {isMobile ? (
        // Ô chọn vẽ giống hệt nút bên cạnh: tắt kiểu mặc định của iOS (to, đậm, mũi tên
        // riêng) rồi tự vẽ mũi tên nhỏ — không thì nó lạc tông cả thanh.
        <span style={{ position: 'relative', flexShrink: 0 }}>
          <select
            aria-label="Chế độ xem"
            value={boardState.activeView}
            onChange={(e) => BoardDataModel.setActiveView(e.target.value as BoardState['activeView'])}
            style={{
              ...selectChip(true),
              appearance: 'none',
              WebkitAppearance: 'none',
              paddingRight: '24px',
              lineHeight: 1.2,
            }}
          >
            <option value="CAM">CAM</option>
            <option value="Both">2 Mặt</option>
            <option value="Real">2D</option>
            <option value="3D">3D</option>
          </select>
          <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-55%)', pointerEvents: 'none', fontSize: 10, color: '#ffffff' }}>
            ▼
          </span>
        </span>
      ) : (() => {
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

      {/* Điện thoại mở từ hai bo trở lên: chọn bo bằng dropdown. Dải tab ngang phải
          vuốt mới thấy bo sau, mà thanh này đã chật vì còn nút chế độ xem. */}
      {isMobile && boardState.boards.length > 1 && (
        <span style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
          <select
            value={boardState.activeBoardId ?? ''}
            onChange={(e) => onSwitchBoard(e.target.value)}
            style={{
              ...selectChip(false),
              flex: 1,
              minWidth: 0,
              appearance: 'none',
              WebkitAppearance: 'none',
              paddingRight: '32px',
              lineHeight: 1.2,
              textOverflow: 'ellipsis',
            }}
          >
            {boardState.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.projectName}
              </option>
            ))}
          </select>
          {/* Không đặt ✕ đóng bo ở đây: nằm sát ô chọn và nút + thì ngón tay bấm nhầm.
              Điện thoại đóng bo qua menu Tệp → Đóng bo đang xem (có Hoàn tác). */}
          <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8', display: 'flex' }}>
            <Icon name="chevronDown" size={14} />
          </span>
        </span>
      )}
      {isMobile && boardState.boards.length > 1 && addBoardBtn}

      {/* Tab các bo đang mở — thả nhiều ZIP thì mỗi ZIP một bo */}
      {!(isMobile && boardState.boards.length > 1) && boardState.boards.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', ...(isMobile ? { flex: 1, minWidth: 0 } : { flexShrink: 0 }) }}>
          {boardState.boards.map((b) => {
            const isActive = b.id === boardState.activeBoardId
            return (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                onClick={() => onSwitchBoard(b.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSwitchBoard(b.id)
                  }
                }}
                title={b.projectName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '2px 2px 2px 10px',
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
                  {b.projectName}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseBoard(b.id)
                  }}
                  title="Đóng bo này (có Hoàn tác)"
                  aria-label={`Đóng ${b.projectName}`}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '3px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    width: 24,
                    height: 24,
                    padding: 0,
                    marginLeft: '2px',
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            )
          })}
          {!isMobile && addBoardBtn}
        </div>
      )}
      {/* Màn gọn: nút + đứng NGOÀI dải tab — trong dải thì tên bo dài đẩy nó ra khỏi
          phần nhìn thấy (dải cuộn ngang). */}
      {isMobile && boardState.boards.length === 1 && addBoardBtn}

      {/* Điện thoại: một nút mở bảng trượt từ đáy, trong đó có hai tab Lớp / Thông tin.
          Hai ngăn kéo hai bên hẹp quá, bảng thông tin không đủ bề ngang để đọc. */}
      {isMobile && (
        <Button
          variant="chip"
          on={drawer !== null}
          icon={drawer ? 'x' : 'layers'}
          onClick={() => setDrawer((d) => (d ? null : 'info'))}
          style={{ marginLeft: 'auto', flexShrink: 0, borderRadius: 14 }}
        >
          {drawer ? 'Đóng' : 'Lớp · Thông tin'}
        </Button>
      )}
    </div>

    </div>
)

const selectChip = (on: boolean): React.CSSProperties => ({
  flexShrink: 0,
  backgroundColor: on ? C.primaryBg : C.raised,
  color: on ? '#ffffff' : C.text,
  border: `1px solid ${on ? C.accent : C.borderSoft}`,
  borderRadius: 14,
  padding: '4px 10px',
  fontSize: FS.sm,
  fontWeight: on ? 600 : 500,
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

const MenuItem: React.FC<{ label: string; hint?: string; disabled?: boolean; danger?: boolean; onClick: () => void }> = ({
  label,
  hint,
  disabled,
  danger,
  onClick,
}) => {
  const [hover, setHover] = useState(false)
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        minHeight: 32,
        padding: '6px 10px',
        border: 'none',
        borderRadius: 4,
        fontSize: 13,
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? '#475569' : danger ? '#fca5a5' : '#e2e8f0',
        backgroundColor: hover && !disabled ? (danger ? '#7f1d1d' : '#2563eb') : 'transparent',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label}</span>
      {hint && <span style={{ fontSize: 11, color: hover && !disabled ? '#dbeafe' : '#94a3b8' }}>{hint}</span>}
    </button>
  )
}
