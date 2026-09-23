/**
 * Test dựng thật các mảng giao diện trong jsdom: thanh công cụ, danh sách lớp, thanh Hoàn
 * tác, và nút Back của điện thoại. Bắt được những lỗi mà trước phải mở trình duyệt mới
 * thấy: nút mất nhãn, đổi chế độ xem không ăn, Hoàn tác không trả lại bo, Back đóng nhầm.
 *
 * Không dựng Viewer2DWebGL (cần WebGL, jsdom không có) — khung xem bo vẫn phải kiểm tay.
 */
// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BoardDataModel, type Board } from '../src/models/BoardDataModel'
import { Toolbars } from '../src/ui/Toolbars'
import { LayerPanel } from '../src/ui/LayerPanel'
import { UndoToast, showUndo } from '../src/ui/undo'
import { useBackToClose } from '../src/ui/useBackToClose'

/** Bo giả tối thiểu — đủ cho phần giao diện, không đụng tới bộ đọc Gerber. */
const fakeBoard = (id: string, name: string): Board => ({
  id,
  projectName: name,
  layers: [
    { id: `${id}-1`, filename: 'a.GTL', displayName: 'Top Copper', shortName: 'a.GTL', type: 'copper', side: 'top', color: '#ff0000' },
    { id: `${id}-2`, filename: 'a.GKO', displayName: 'Outline', shortName: 'a.GKO', type: 'outline', side: 'all', color: '#ffff00' },
  ] as unknown as Board['layers'],
  visibleLayers: new Set([`${id}-1`]),
  activeLayerId: null,
  sideFilter: 'all',
  bounds: { widthMM: 80, heightMM: 75, minX: 0, minY: 0, maxX: 80, maxY: 75 } as Board['bounds'],
  layerCount: 2,
  isLoaded: true,
  maskColor: '#0f7f3f',
  ignoredFiles: [],
  failedFiles: [],
  sourceDir: '',
  parseMs: 0,
} as unknown as Board)

afterEach(() => {
  cleanup()
  BoardDataModel.reset()
})

describe('Thanh công cụ', () => {
  const setup = (over: Partial<React.ComponentProps<typeof Toolbars>> = {}) => {
    const props = {
      board: BoardDataModel.getState(),
      isMobile: false,
      drawer: null,
      setDrawer: vi.fn(),
      fileMenuOpen: false,
      setFileMenuOpen: vi.fn(),
      onPickFiles: vi.fn(),
      onCloseBoard: vi.fn(),
      onCloseAllBoards: vi.fn(),
      onSwitchBoard: vi.fn(),
      onOpenQuotation: vi.fn(),
      onOpenSettings: vi.fn(),
      addBoardBtn: null,
      ...over,
    } as React.ComponentProps<typeof Toolbars>
    render(<Toolbars {...props} />)
    return props
  }

  it('mọi nút đều có nhãn đọc được (chữ hoặc aria-label)', () => {
    setup()
    const buttons = [...document.querySelectorAll('button')]
    expect(buttons.length).toBeGreaterThan(3)
    for (const b of buttons) {
      const name = b.textContent?.trim() || b.getAttribute('aria-label') || ''
      expect(name, b.outerHTML.slice(0, 80)).not.toBe('')
    }
  })

  it('bấm Báo giá / Cài đặt / Mở gọi đúng việc', () => {
    const p = setup()
    fireEvent.click(screen.getByLabelText('Báo giá'))
    expect(p.onOpenQuotation).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Cài đặt'))
    expect(p.onOpenSettings).toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('Mở file Gerber (ZIP, RAR hoặc file lẻ)'))
    expect(p.onPickFiles).toHaveBeenCalledWith(false)
  })

  it('công tắc chế độ xem: CAM ⇄ 2 Mặt, và nhảy nhóm 2D/3D', () => {
    setup()
    const camGroup = screen.getByTitle(/CAM ⇄ 2 Mặt/)
    expect(BoardDataModel.getState().activeView).toBe('CAM')
    fireEvent.click(camGroup)
    expect(BoardDataModel.getState().activeView).toBe('Both')
    fireEvent.click(screen.getByTitle('2D ⇄ 3D'))
    expect(BoardDataModel.getState().activeView).toBe('Real')
  })

  it('điện thoại: chọn chế độ xem bằng ô chọn', () => {
    setup({ isMobile: true })
    const select = screen.getByLabelText('Chế độ xem') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '3D' } })
    expect(BoardDataModel.getState().activeView).toBe('3D')
  })
})

describe('Danh sách lớp', () => {
  const renderPanel = (isMobile = false) => {
    BoardDataModel.restoreBoards([{ board: fakeBoard('b1', 'Bo A'), index: 0 }])
    render(
      <LayerPanel
        board={BoardDataModel.getState()}
        isMobile={isMobile}
        drawer="layers"
        tabs={null}
        sheetStyle={{}}
      />
    )
  }

  it('mỗi ô bật/tắt lớp có nhãn kèm tên lớp', () => {
    renderPanel()
    const boxes = [...document.querySelectorAll('input[type=checkbox]')]
    expect(boxes.length).toBe(2)
    for (const b of boxes) expect(b.getAttribute('aria-label')).toMatch(/^Hiện lớp /)
  })

  it('bấm ô là bật/tắt đúng lớp đó', () => {
    renderPanel()
    const box = screen.getByLabelText('Hiện lớp Top Copper') as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(BoardDataModel.getState().visibleLayers.has('b1-1')).toBe(false)
  })

  it('Hiện tất cả / Ẩn tất cả', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Ẩn tất cả'))
    expect(BoardDataModel.getState().visibleLayers.size).toBe(0)
    fireEvent.click(screen.getByText('Hiện tất cả'))
    expect(BoardDataModel.getState().visibleLayers.size).toBe(2)
  })

  it('lọc theo mặt', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Mặt Bot'))
    expect(BoardDataModel.getState().sideFilter).toBe('bottom')
  })
})

describe('Thanh Hoàn tác', () => {
  it('hiện chữ, bấm Hoàn tác thì chạy việc hoàn tác rồi tự ẩn', () => {
    const undo = vi.fn()
    render(<UndoToast />)
    act(() => showUndo('Đã đóng Bo A', undo))
    expect(screen.getByText('Đã đóng Bo A')).toBeTruthy()
    fireEvent.click(screen.getByText(/Hoàn tác/))
    expect(undo).toHaveBeenCalled()
    expect(screen.queryByText('Đã đóng Bo A')).toBeNull()
  })

  it('đóng bo rồi hoàn tác thì bo về đúng chỗ, giữ nguyên id', () => {
    BoardDataModel.restoreBoards([
      { board: fakeBoard('b1', 'Bo A'), index: 0 },
      { board: fakeBoard('b2', 'Bo B'), index: 1 },
    ])
    const closed = BoardDataModel.closeBoard('b1')!
    expect(BoardDataModel.getState().boards.map((b) => b.id)).toEqual(['b2'])
    BoardDataModel.restoreBoards([closed])
    expect(BoardDataModel.getState().boards.map((b) => b.id)).toEqual(['b1', 'b2'])
  })
})

describe('Nút Back của điện thoại', () => {
  const Dialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    useBackToClose(true, onClose)
    return <div>hộp</div>
  }

  beforeEach(() => {
    history.replaceState(null, '', '/')
  })

  it('mở hộp thì đẩy một mục lịch sử, Back đóng hộp chứ không rời trang', async () => {
    const onClose = vi.fn()
    render(<Dialog onClose={onClose} />)
    expect(history.state?.dqpcbDialog).toBe(true)
    await act(async () => {
      history.back()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('đóng bằng nút trên màn hình thì bỏ mục lịch sử đã đẩy', async () => {
    const { unmount } = render(<Dialog onClose={vi.fn()} />)
    await act(async () => {
      unmount()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(history.state?.dqpcbDialog).toBeUndefined()
  })
})
