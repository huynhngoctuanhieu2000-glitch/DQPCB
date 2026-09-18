/**
 * Tên file ảnh chụp bo: theo tên bo, nhưng tên bo lấy từ tên file/thư mục của khách
 * nên có thể chứa ký tự Windows cấm — phải lọc, nếu không hộp thoại lưu báo lỗi.
 */
import { describe, it, expect } from 'vitest'
import { captureFileName } from '../src/modules/viewer2d/captureBoard'

describe('captureFileName', () => {
  it('lấy tên bo làm tên ảnh', () => {
    expect(captureFileName('Demo_PCB_120x80')).toBe('Demo_PCB_120x80_2mat.png')
  })

  it('thay ký tự Windows cấm, giữ nguyên phần còn lại', () => {
    expect(captureFileName('KEEM/G2:103B?')).toBe('KEEM_G2_103B_2mat.png')
  })

  it('tên rỗng thì gọi là board', () => {
    expect(captureFileName('')).toBe('board_2mat.png')
    expect(captureFileName('///')).toBe('board_2mat.png')
  })
})
