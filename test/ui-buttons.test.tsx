/**
 * Test giao diện: những luật trong docs/ui-dien-thoai.md mục 6 mà trước đây chỉ kiểm được
 * bằng tay (mở trình duyệt, đo DOM). Chạy trong `npm test` cùng các test khác.
 *
 * jsdom không tính layout (mọi getBoundingClientRect đều 0) nên KHÔNG đo được cỡ nút thật;
 * ở đây kiểm hai thứ đo được: (1) hợp đồng của component dùng chung — cỡ, màu, nhãn cho
 * trình đọc màn hình; (2) luật viết code trên toàn bộ src — nút chỉ có icon phải có nhãn,
 * không dùng emoji làm icon, mốc màn hẹp khai cùng một số ở hai nơi.
 */
// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { Button } from '../src/ui/Button'
import { TAP } from '../src/ui/theme'

const SRC = path.join(__dirname, '..', 'src')

/** Mọi file .ts/.tsx trong src. */
const sourceFiles = (dir = SRC): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(p)
    return /\.tsx?$/.test(e.name) ? [p] : []
  })

const read = (p: string) => fs.readFileSync(p, 'utf-8')
const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, '/')

describe('Button dùng chung', () => {
  it('không nút nào thấp hơn sàn vùng chạm của máy tính', () => {
    for (const size of ['md', 'sm', 'icon'] as const) {
      const { container, unmount } = render(<Button size={size}>x</Button>)
      const el = container.querySelector('button')!
      expect(parseInt(el.style.minHeight, 10), `size=${size}`).toBeGreaterThanOrEqual(TAP.dense)
      unmount()
    }
  })

  it('cỡ icon là hình vuông (nút chỉ có icon không bị bóp hẹp)', () => {
    const { container } = render(<Button size="icon" icon="x" aria-label="Đóng" />)
    const el = container.querySelector('button')!
    expect(el.style.minWidth).toBe(el.style.minHeight)
  })

  it('KHÔNG đặt chiều cao vượt sàn điện thoại — sàn trong index.css sẽ không kéo được nữa', () => {
    for (const size of ['md', 'sm', 'icon'] as const) {
      const { container, unmount } = render(<Button size={size}>x</Button>)
      const h = parseInt(container.querySelector('button')!.style.minHeight, 10)
      expect(h, `size=${size}`).toBeLessThanOrEqual(TAP.mobileDense)
      unmount()
    }
  })

  it('nút mờ khi disabled và không bấm được', () => {
    const { container } = render(<Button disabled>x</Button>)
    const el = container.querySelector('button')!
    expect(el.disabled).toBe(true)
    expect(Number(el.style.opacity)).toBeLessThan(1)
  })

  it('chip sáng lên khi được chọn', () => {
    const off = render(<Button variant="chip">A</Button>).container.querySelector('button')!.style.backgroundColor
    const on = render(<Button variant="chip" on>A</Button>).container.querySelector('button')!.style.backgroundColor
    expect(on).not.toBe(off)
  })

  it('nhãn cho trình đọc màn hình giữ nguyên', () => {
    render(<Button icon="camera" aria-label="Chụp ảnh hai mặt" />)
    expect(screen.getByLabelText('Chụp ảnh hai mặt')).toBeTruthy()
  })
})

describe('Luật viết giao diện (quét toàn bộ src)', () => {
  it('nút chỉ có icon đều có aria-label — điện thoại không rê chuột xem title được', () => {
    const bad: string[] = []
    for (const f of sourceFiles()) {
      const src = read(f)
      // <Button size="icon" ... /> và <Button ... icon=... /> không có children chữ
      const re = /<Button\b[^>]*?\/>/gs
      for (const m of src.match(re) ?? []) {
        if (!/icon=/.test(m)) continue
        if (/aria-label=/.test(m)) continue
        bad.push(`${rel(f)}: ${m.replace(/\s+/g, ' ').slice(0, 80)}`)
      }
    }
    expect(bad, 'thiếu aria-label').toEqual([])
  })

  it('không dùng emoji làm nhãn nút', () => {
    // Chỉ emoji HÌNH (📄 ⚙ 🎯…) — mỗi máy vẽ một kiểu và không đổi màu theo nút.
    // Mũi tên/dấu ✓ trong câu chữ thì không sao.
    const emoji = /[\u{1F300}-\u{1FAFF}]/u
    const bad: string[] = []
    for (const f of sourceFiles()) {
      for (const [i, line] of read(f).split(/\r?\n/).entries()) {
        const t = line.trim()
        // bỏ qua chú thích và chuỗi thông báo (chỉ soi nhãn nút một mình trên dòng)
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) continue
        if (!emoji.test(t)) continue
        // Chỉ soi NHÃN (chữ hiện ra trên nút), bỏ qua dòng có thuộc tính (title="… → …")
        // và chuỗi thông báo trong code.
        if (t.includes('=') || t.includes('(')) continue
        bad.push(`${rel(f)}:${i + 1} ${t.slice(0, 60)}`)
      }
    }
    expect(bad, 'emoji trong nhãn nút').toEqual([])
  })

  it('mốc màn hẹp khai cùng một số ở useIsMobile.ts và index.css', () => {
    const hook = read(path.join(SRC, 'ui', 'useIsMobile.ts'))
    const css = read(path.join(SRC, 'index.css'))
    const q = /\(max-width:\s*([\d.]+)px\)/.exec(hook)?.[1]
    expect(q, 'không đọc được mốc trong useIsMobile.ts').toBeTruthy()
    const widths = [...css.matchAll(/@media \(max-width:\s*([\d.]+)px\)/g)].map((m) => m[1])
    expect(widths.length, 'index.css không có @media nào').toBeGreaterThan(0)
    expect([...new Set(widths)], 'index.css dùng mốc khác hook').toEqual([q])
  })

  it('index.css vẫn giữ sàn vùng chạm cho màn gọn', () => {
    const css = read(path.join(SRC, 'index.css'))
    expect(css).toMatch(/min-height:\s*40px\s*!important/)
    expect(css).toMatch(/:focus-visible/)
  })

  it('màu trong file giao diện lấy từ theme, không gõ thẳng mã hex mới', () => {
    // Ngưỡng hiện tại; sửa giao diện mà số này TĂNG là đang gõ màu thẳng thay vì dùng token.
    const LIMIT = 330
    let n = 0
    for (const f of sourceFiles()) {
      if (!f.endsWith('.tsx')) continue
      if (/RealPalette|MaskColors|Icon\.tsx|QuotationPreview/.test(f)) continue // màu bo/logo, không phải màu giao diện
      n += (read(f).match(/#[0-9a-fA-F]{6}/g) ?? []).length
    }
    expect(n, `số mã màu gõ thẳng (${n}) vượt ngưỡng`).toBeLessThanOrEqual(LIMIT)
  })
})
