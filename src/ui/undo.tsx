/**
 * Thanh "Đã … · Hoàn tác" hiện 6 giây sau một thao tác phá huỷ (đóng bo, xoá dòng
 * báo giá). Thay cho hộp hỏi "Bạn có chắc?" ở những thao tác làm thường xuyên: hỏi
 * mỗi lần thì phiền, còn không hỏi mà không có đường lui thì bấm nhầm là mất.
 *
 * Gọi `showUndo(text, onUndo)` từ đâu cũng được; `<UndoToast />` đặt một lần ở Layout.
 */
import React, { useEffect, useState } from 'react'
import { Icon } from './Icon'

type Entry = { id: number; text: string; onUndo: () => void }

let current: Entry | null = null
let nextId = 1
const listeners = new Set<(e: Entry | null) => void>()
const emit = () => listeners.forEach((l) => l(current))

export const showUndo = (text: string, onUndo: () => void) => {
  current = { id: nextId++, text, onUndo }
  emit()
}

const DURATION_MS = 6000

export const UndoToast: React.FC = () => {
  const [entry, setEntry] = useState<Entry | null>(current)
  useEffect(() => {
    listeners.add(setEntry)
    return () => {
      listeners.delete(setEntry)
    }
  }, [])
  useEffect(() => {
    if (!entry) return
    const t = window.setTimeout(() => {
      if (current?.id === entry.id) {
        current = null
        emit()
      }
    }, DURATION_MS)
    return () => window.clearTimeout(t)
  }, [entry])

  if (!entry) return null
  const dismiss = () => {
    current = null
    emit()
  }
  return (
    <div role="status" style={bar}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.text}
      </span>
      <button
        className="tap"
        onClick={() => {
          entry.onUndo()
          dismiss()
        }}
        style={undoBtn}
      >
        <Icon name="undo" size={15} /> Hoàn tác
      </button>
      <button className="tap" onClick={dismiss} style={closeBtn} aria-label="Ẩn">
        <Icon name="x" size={15} />
      </button>
    </div>
  )
}

const bar: React.CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(20px + env(safe-area-inset-bottom))',
  transform: 'translateX(-50%)',
  zIndex: 300,
  width: 'min(440px, calc(100vw - 24px))',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 6px 6px 14px',
  borderRadius: 8,
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  color: '#e2e8f0',
  fontSize: 13,
}

const undoBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 32,
  padding: '0 12px',
  borderRadius: 6,
  border: 'none',
  backgroundColor: '#0369a1',
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const closeBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 32,
  minHeight: 32,
  border: 'none',
  borderRadius: 6,
  backgroundColor: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
}
