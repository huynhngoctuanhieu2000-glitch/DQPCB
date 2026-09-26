/**
 * Thẻ tính giá phải bám theo SỐ LỚP của bo, kể cả khi số lớp đổi giữa chừng.
 *
 * App đọc thiếu một lớp đồng → bo ra 1 lớp; người lập gán tay loại lớp ở CAM thì app đọc
 * lại, số lớp thành 2 nhưng id bo giữ nguyên. Trước 26/09/2026 thẻ giá chỉ lấy số lớp lúc
 * MỞ bo nên vẫn tính như bo 1 lớp — mà bo 1 lớp không nằm trong bảng giá nhà máy nên nút
 * "Bảng tra" khoá luôn, không gạt qua lại được.
 */
// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PricingCard } from '../src/modules/pricing/PricingCard'
import type { BoardState } from '../src/models/BoardDataModel'

const boardWith = (layerCount: number | null): BoardState =>
  ({
    id: layerCount === null ? '' : 'b1',
    activeBoardId: layerCount === null ? null : 'b1',
    activeView: 'CAM',
    isLoaded: layerCount !== null,
    projectName: 'bo-test',
    layers: [],
    boards: [],
    visibleLayers: new Set<string>(),
    activeLayerId: null,
    sideFilter: 'all',
    // 40 × 30 mm: nằm gọn trong khổ bảng giá nhà máy.
    bounds: layerCount === null ? null : { widthMM: 40, heightMM: 30, minX: 0, minY: 0, maxX: 40, maxY: 30 },
    layerCount: layerCount ?? 2,
    drillCount: 0,
    maskColor: '#185428',
    ignoredFiles: [],
    failedFiles: [],
    sourceDir: '',
    parseMs: 0,
    layersOverride: null,
    parsed: null,
    specImages: [],
    layerOverrides: {},
  }) as unknown as BoardState

const noop = () => {}
const card = (board: BoardState) => (
  <PricingCard board={board} onPriceChange={noop} onSendToQuotation={noop} onOpenSettings={noop} />
)
const tableBtn = () => screen.getByRole('button', { name: 'Bảng tra' }) as HTMLButtonElement

afterEach(cleanup)

describe('PricingCard theo số lớp', () => {
  it('đọc lại bo ra 2 lớp thì thẻ giá đổi theo và mở khoá nút Bảng tra', () => {
    // Mở app khi chưa có bo, rồi mở bo đọc ra 1 lớp.
    const { rerender, container } = render(card(boardWith(null)))
    rerender(card(boardWith(1)))
    expect(container.textContent).toMatch(/1 lớp/)
    expect(tableBtn().disabled).toBe(true)

    // Gán tay loại lớp → app đọc lại, vẫn là bo đó nhưng thành 2 lớp.
    rerender(card(boardWith(2)))
    expect(container.textContent).toMatch(/2 lớp/)
    expect(tableBtn().disabled).toBe(false)
  })
})
