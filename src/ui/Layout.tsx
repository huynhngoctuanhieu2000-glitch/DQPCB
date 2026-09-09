import React, { useState, useEffect, useRef } from 'react'
import { Viewer2DWebGL } from '../modules/viewer2d/Viewer2D.WebGL'
import { BoardDataModel } from '../models/BoardDataModel'
import type { BoardState } from '../models/BoardDataModel'
import { GerberParser } from '../core/GerberParser'
import { MASK_COLORS } from '../models/MaskColors'
import { QuotationPanel } from '../modules/quotation/QuotationPanel'
import JSZip from 'jszip'

export const Layout: React.FC = () => {
  const [boardState, setBoardState] = useState(BoardDataModel.getState())
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showQuotation, setShowQuotation] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Kích thước khung chia đôi — nhãn kích thước cần biết để bám sát mép bo
  const splitRef = useRef<HTMLDivElement>(null)
  const [splitSize, setSplitSize] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    return BoardDataModel.subscribe((state) => {
      setBoardState(state)
    })
  }, [])

  useEffect(() => {
    const el = splitRef.current
    if (!el) return
    const ro = new ResizeObserver(() =>
      setSplitSize({ w: el.clientWidth, h: el.clientHeight })
    )
    ro.observe(el)
    setSplitSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
    // isLoaded phải có trong deps: khi đổi sang "2 Mặt" lúc chưa nạp bo thì khung
    // chia đôi chưa tồn tại, ref còn null nên observer không gắn được.
  }, [boardState.activeView, boardState.isLoaded])

  const processFiles = async (files: File[]) => {
    if (!files || files.length === 0) return
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const parsedBoards = await GerberParser.parseInputFiles(files)
      BoardDataModel.addBoards(parsedBoards)
    } catch (err: any) {
      console.error('Failed to parse Gerber files:', err)
      setErrorMessage(err?.message || 'Failed to read files. Please ensure it is a valid Gerber ZIP.')
    } finally {
      setIsLoading(false)
    }
  }

  const loadDemoBoard = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const zip = new JSZip()
      // 1. Outline (GKO)
      zip.file(
        'demo_board.GKO',
        '%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,0.2000*%\nD10*\nX0Y0D02*\nX1200000Y0D01*\nX1200000Y800000D01*\nX0Y800000D01*\nX0Y0D01*\nM02*'
      )
      // 2. Top Copper (GTL)
      zip.file(
        'demo_board.GTL',
        '%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,0.3500*%\n%ADD11R,1.8000X1.2000*%\n%ADD12C,2.0000*%\nD10*\nX150000Y150000D02*\nX1050000Y150000D01*\nX1050000Y650000D01*\nX150000Y650000D01*\nD11*\nX300000Y400000D03*\nX400000Y400000D03*\nX500000Y400000D03*\nX600000Y400000D03*\nX700000Y400000D03*\nX800000Y400000D03*\nX900000Y400000D03*\nD12*\nX200000Y200000D03*\nX1000000Y200000D03*\nX200000Y600000D03*\nX1000000Y600000D03*\nM02*'
      )
      // 3. Bot Copper (GBL)
      zip.file(
        'demo_board.GBL',
        '%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,0.5000*%\n%ADD12C,2.0000*%\nD10*\nX200000Y200000D02*\nX600000Y400000D01*\nX1000000Y600000D01*\nD12*\nX200000Y200000D03*\nX1000000Y200000D03*\nX200000Y600000D03*\nX1000000Y600000D03*\nM02*'
      )
      // 4. Drill (DRL)
      zip.file(
        'demo_board.DRL',
        'M48\nMETRIC,TZ\nT01C1.000\nT02C3.200\n%\nT01\nX20000Y20000\nX100000Y20000\nX20000Y60000\nX100000Y60000\nT02\nX60000Y40000\nM30'
      )
      // 5. Top Silk (GTO)
      zip.file(
        'demo_board.GTO',
        '%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,0.1500*%\nD10*\nX100000Y700000D02*\nX500000Y700000D01*\nX100000Y100000D02*\nX1100000Y100000D01*\nM02*'
      )

      const buffer = await zip.generateAsync({ type: 'arraybuffer' })
      const mockFile = {
        name: 'Demo_PCB_120x80.zip',
        arrayBuffer: async () => buffer,
        text: async () => '',
      } as any

      const parsedBoards = await GerberParser.parseInputFiles([mockFile])
      BoardDataModel.addBoards(parsedBoards)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load demo board')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      await processFiles(files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingOver(false)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files)
      processFiles(files)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#121316',
        color: '#e2e8f0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        overflow: 'hidden',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        accept=".zip,.rar,.gtl,.gbl,.gts,.gbs,.gto,.gbo,.gko,.gm1,.drl,.txt,.*"
        style={{ display: 'none' }}
      />

      {/* 1. TOP MENU BAR */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '32px',
          backgroundColor: '#1a1c22',
          borderBottom: '1px solid #282b34',
          padding: '0 8px',
          fontSize: '13px',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', color: '#94a3b8', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: '#e2e8f0' }}>DQPCB</span>
          <span
            style={{ cursor: 'pointer', padding: '2px 6px', borderRadius: '3px' }}
            onClick={() => fileInputRef.current?.click()}
          >
            File
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={loadDemoBoard}
            style={{
              backgroundColor: '#475569',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            ⚡ Load Demo
          </button>
          <button
            onClick={() => {
              if (boardState.activeView === '3D') {
                BoardDataModel.setActiveView('CAM')
              } else {
                BoardDataModel.setActiveView('3D')
              }
            }}
            style={{
              backgroundColor: boardState.activeView === '3D' ? '#2563eb' : '#334155',
              color: '#ffffff',
              border: boardState.activeView === '3D' ? '1px solid #60a5fa' : 'none',
              borderRadius: '4px',
              padding: '3px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {boardState.activeView === '3D' ? '🕶️ 2D View' : '🧊 3D View'}
          </button>
          <button
            onClick={() => setShowQuotation(true)}
            title="Lập báo giá Excel từ bo đang mở"
            style={{
              backgroundColor: '#0ea5e9',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            📄 Báo giá
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              backgroundColor: '#10b981',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            + Open Gerber ZIP
          </button>
        </div>
      </div>

      {/* 2. SUB-TOOLBAR / TAB ROW */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '38px',
          backgroundColor: '#16181e',
          borderBottom: '1px solid #282b34',
          padding: '0 12px',
          gap: '12px',
        }}
      >
        {/* View Mode Buttons */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#0f172a',
            borderRadius: '14px',
            padding: '2px',
            border: '1px solid #334155',
          }}
        >
          <button
            onClick={() => BoardDataModel.setActiveView('CAM')}
            style={{
              backgroundColor: boardState.activeView === 'CAM' ? '#3b82f6' : 'transparent',
              color: boardState.activeView === 'CAM' ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            CAM 2D
          </button>
          <button
            onClick={() => BoardDataModel.setActiveView('Real')}
            style={{
              backgroundColor: boardState.activeView === 'Real' ? '#3b82f6' : 'transparent',
              color: boardState.activeView === 'Real' ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Real 2D
          </button>
          <button
            onClick={() => BoardDataModel.setActiveView('3D')}
            style={{
              backgroundColor: boardState.activeView === '3D' ? '#3b82f6' : 'transparent',
              color: boardState.activeView === '3D' ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            3D View
          </button>
          <button
            onClick={() => BoardDataModel.setActiveView('Both')}
            style={{
              backgroundColor: boardState.activeView === 'Both' ? '#3b82f6' : 'transparent',
              color: boardState.activeView === 'Both' ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
            title="Xem đồng thời mặt Top và mặt Bot (mặt Bot đã lật gương)"
          >
            2 Mặt
          </button>
        </div>

        {/* Tab các bo đang mở — thả nhiều ZIP thì mỗi ZIP một bo */}
        {boardState.boards.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto' }}>
            {boardState.boards.map((b) => {
              const isActive = b.id === boardState.activeBoardId
              return (
                <div
                  key={b.id}
                  onClick={() => BoardDataModel.setActiveBoard(b.id)}
                  title={b.projectName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 6px 3px 10px',
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
                    📁 {b.projectName}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      BoardDataModel.closeBoard(b.id)
                    }}
                    title="Đóng bo này"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '0 2px',
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Màu phủ bo — dùng chung cho Real 2D, 3D và 2 Mặt */}
        {boardState.isLoaded && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Màu bo</span>
            {MASK_COLORS.map((c) => (
              <button
                key={c.hex}
                title={c.label}
                onClick={() => BoardDataModel.setMaskColor(c.hex)}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '3px',
                  backgroundColor: c.hex,
                  cursor: 'pointer',
                  padding: 0,
                  border:
                    boardState.maskColor === c.hex
                      ? '2px solid #60a5fa'
                      : '1px solid rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 3. MAIN WORKSPACE: 3-COLUMN SPLIT */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ================= COLUMN 1: LEFT LAYERS PANEL ================= */}
        <div
          style={{
            width: '240px',
            backgroundColor: '#181a20',
            borderRight: '1px solid #282b34',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Layers header & tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #282b34',
              backgroundColor: '#14161b',
            }}
          >
            <div
              style={{
                flex: 1,
                padding: '8px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 600,
                color: '#38bdf8',
                borderBottom: '2px solid #38bdf8',
              }}
            >
              Layers ({boardState.layers.length})
            </div>
          </div>

          {/* Side Filter Tabs (All / Top / Bottom) */}
          {boardState.layers.length > 0 && (
            <div
              style={{
                display: 'flex',
                padding: '6px 8px',
                gap: '4px',
                backgroundColor: '#16181e',
                borderBottom: '1px solid #282b34',
              }}
            >
              {(['all', 'top', 'bottom'] as const).map((side) => {
                const isActive = boardState.sideFilter === side
                return (
                  <button
                    key={side}
                    onClick={() => BoardDataModel.setSideFilter(side)}
                    style={{
                      flex: 1,
                      backgroundColor: isActive ? '#2563eb' : '#1e293b',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px 0',
                      fontSize: '11px',
                      fontWeight: isActive ? 600 : 400,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {side === 'all' ? 'All' : side === 'top' ? 'Top Side' : 'Bot Side'}
                  </button>
                )
              })}
            </div>
          )}

          {/* Quick Visibility Controls */}
          {boardState.layers.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 10px',
                borderBottom: '1px solid #282b34',
                fontSize: '11px',
                color: '#94a3b8',
                backgroundColor: '#121418',
              }}
            >
              <span
                style={{ cursor: 'pointer', color: '#38bdf8' }}
                onClick={() => BoardDataModel.setAllLayersVisible(true)}
              >
                ✓ All On
              </span>
              <span
                style={{ cursor: 'pointer', color: '#94a3b8' }}
                onClick={() => BoardDataModel.setAllLayersVisible(false)}
              >
                ✕ All Off
              </span>
            </div>
          )}

          {/* Layers List Table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
            {boardState.layers.length === 0 ? (
              <div style={{ padding: '20px 10px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                No layers loaded yet.
                <br />
                <br />
                <button
                  onClick={loadDemoBoard}
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#38bdf8',
                    border: '1px solid #38bdf8',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Load Demo Board
                </button>
              </div>
            ) : (
              boardState.layers.map((layer, index) => {
                const isVisible = boardState.visibleLayers.has(layer.id)
                const isActive = boardState.activeLayerId === layer.id
                // Nhiều lớp cùng loại (3 file khoan, nhiều lớp inner…) sẽ có cùng
                // displayName → thêm phần tên riêng để phân biệt được trên panel.
                const isDuplicate =
                  boardState.layers.filter((l) => l.displayName === layer.displayName).length > 1
                const label =
                  isDuplicate && layer.shortName ? `${layer.displayName} · ${layer.shortName}` : layer.displayName
                return (
                  <div
                    key={layer.id}
                    onClick={() => BoardDataModel.setActiveLayer(layer.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '5px 8px',
                      borderRadius: '4px',
                      marginBottom: '2px',
                      backgroundColor: isActive
                        ? 'rgba(56, 189, 248, 0.12)'
                        : isVisible
                        ? 'rgba(255,255,255,0.03)'
                        : 'transparent',
                      border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                      opacity: isVisible ? 1 : 0.4,
                      fontSize: '12px',
                      gap: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.1s ease',
                    }}
                  >
                    {/* Index */}
                    <span style={{ width: '14px', color: '#64748b', fontSize: '11px', textAlign: 'right' }}>
                      {index + 1}
                    </span>

                    {/* Visibility Checkbox */}
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={(e) => {
                        e.stopPropagation()
                        BoardDataModel.toggleLayer(layer.id)
                      }}
                      style={{ cursor: 'pointer', accentColor: layer.color }}
                    />

                    {/* Ô màu — bấm để đổi màu lớp (áp dụng cho chế độ CAM 2D) */}
                    <label
                      title="Đổi màu lớp (chế độ CAM)"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '3px',
                        backgroundColor: layer.color,
                        border: '1px solid rgba(255,255,255,0.2)',
                        flexShrink: 0,
                        cursor: 'pointer',
                        display: 'block',
                        position: 'relative',
                      }}
                    >
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(e) => BoardDataModel.setLayerColor(layer.id, e.target.value)}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          opacity: 0,
                          width: '100%',
                          height: '100%',
                          padding: 0,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      />
                    </label>

                    {/* Display Name */}
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: isVisible ? 600 : 400,
                          color: isVisible ? '#f1f5f9' : '#64748b',
                        }}
                        title={`${layer.filename}  —  ${layer.type}/${layer.side}`}
                      >
                        {label}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={layer.filename}
                      >
                        {layer.shortName || layer.filename}
                      </span>
                    </div>

                    {/* Solo Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        BoardDataModel.soloLayer(layer.id)
                      }}
                      style={{
                        backgroundColor: 'transparent',
                        color: '#64748b',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '2px 4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        opacity: 0.7,
                      }}
                      title="Solo this layer (Chỉ xem lớp này)"
                    >
                      🎯
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Chẩn đoán: file bị bỏ qua / không đọc được — trước đây chỉ ghi console.warn
              nên người dùng không biết vì sao thiếu lớp. */}
          {(boardState.failedFiles.length > 0 || boardState.ignoredFiles.length > 0) && (
            <div
              style={{
                borderTop: '1px solid #282b34',
                padding: '6px 10px',
                fontSize: '10px',
                lineHeight: 1.5,
                color: '#64748b',
                backgroundColor: '#121418',
                maxHeight: '120px',
                overflowY: 'auto',
                flexShrink: 0,
              }}
            >
              {boardState.failedFiles.length > 0 && (
                <div style={{ color: '#f87171' }}>
                  ⚠ {boardState.failedFiles.length} file không đọc được:{' '}
                  <span title={boardState.failedFiles.map((f) => `${f.name}: ${f.reason}`).join(' | ')}>
                    {boardState.failedFiles.map((f) => f.name).join(', ')}
                  </span>
                </div>
              )}
              {boardState.ignoredFiles.length > 0 && (
                <div title={boardState.ignoredFiles.join(' | ')}>
                  ℹ {boardState.ignoredFiles.length} file phụ trợ đã bỏ qua (report / aperture / BOM)
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= COLUMN 2: CENTER CANVAS VIEW ================= */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            backgroundColor: '#000000',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* If loading indicator */}
          {isLoading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50,
                color: '#38bdf8',
                fontSize: '16px',
                fontWeight: 600,
                backdropFilter: 'blur(2px)',
              }}
            >
              ⏳ Parsing Gerber ZIP files...
            </div>
          )}

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
                margin: '16px',
                borderRadius: '8px',
                backgroundColor: isDraggingOver ? 'rgba(56, 189, 248, 0.05)' : '#0d0e12',
                cursor: 'pointer',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📁</div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#f1f5f9' }}>
                Drop Gerber ZIP file here
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                Supports Altium, KiCad, Eagle, EasyEDA (.ZIP, .GTL, .GBL, .GKO, .DRL)
              </p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
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
                  Browse Files
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    loadDemoBoard()
                  }}
                  style={{
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Load Demo Board
                </button>
              </div>
            </div>
          )}

          {/* Một viewer duy nhất phục vụ cả CAM 2D / Real 2D / 3D.
              Chế độ "2 Mặt" dựng hai cảnh độc lập cạnh nhau: trái nhìn từ trên
              (Top), phải nhìn từ dưới lên nên là ảnh lật gương (Bot) — đúng quy
              ước bản vẽ lắp ráp của nhà máy. */}
          {boardState.isLoaded &&
            (boardState.activeView === 'Both' ? (
              <div
                ref={splitRef}
                style={{
                  flex: 1,
                  display: 'flex',
                  minHeight: 0,
                  position: 'relative',
                  // Khoảng trắng giữa hai khung: bỏ đường kẻ ngăn rồi thì lúc zoom vào,
                  // hai nền bo chạm nhau và đọc thành một khối liền. Dải nền cùng màu
                  // với nền canvas nên tách được mà không phải vẽ lại vạch ngăn.
                  gap: '28px',
                  backgroundColor: '#eeeeee',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Viewer2DWebGL viewOverride="Real" faceSide="top" hideBadge fitPadding={SPLIT_FIT_PADDING} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Viewer2DWebGL viewOverride="Real" faceSide="bottom" hideBadge fitPadding={SPLIT_FIT_PADDING} />
                </div>

                {/* Nhãn kích thước nổi giữa hai khung, sát bo — thanh chạy hết chiều
                    ngang ở đáy trông rời rạc khi chụp màn hình. */}
                <BoardBadge
                  bounds={boardState.bounds}
                  layerCount={boardState.layerCount}
                  panel={splitSize}
                />
              </div>
            ) : (
              <Viewer2DWebGL />
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

        {/* ================= COLUMN 3: RIGHT PCB ANALYSIS PANEL ================= */}
        <div
          style={{
            width: '280px',
            backgroundColor: '#181a20',
            borderLeft: '1px solid #282b34',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Tab Header */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #282b34',
              backgroundColor: '#14161b',
            }}
          >
            <div
              style={{
                flex: 1,
                padding: '8px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 600,
                color: '#38bdf8',
                borderBottom: '2px solid #38bdf8',
              }}
            >
              Thông tin bo
            </div>
          </div>

          {/* Parameters Table — chỉ hiển thị số liệu thật sự đọc được từ Gerber */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                <AnalysisRow label="Tên bo" value={boardState.projectName || '--'} />
                <AnalysisRow
                  label="Kích thước"
                  value={
                    boardState.bounds
                      ? `${boardState.bounds.widthMM.toFixed(2)} × ${boardState.bounds.heightMM.toFixed(2)} mm`
                      : '--'
                  }
                />
                <AnalysisRow label="Số lớp đồng" value={boardState.isLoaded ? `${boardState.layerCount}` : '--'} />
                <AnalysisRow label="File khoan" value={boardState.isLoaded ? `${boardState.drillCount}` : '--'} />
                <AnalysisRow label="Tổng lớp đọc được" value={boardState.isLoaded ? `${boardState.layers.length}` : '--'} />
              </tbody>
            </table>

            <div
              style={{
                marginTop: '16px',
                padding: '10px',
                borderRadius: '6px',
                border: '1px dashed #334155',
                color: '#64748b',
                fontSize: '11px',
                lineHeight: 1.6,
              }}
            >
              <div style={{ color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                Chưa làm
              </div>
              DFM rule check (trace/space, annular ring, drill-to-copper, board edge…),
              đo kích thước, ghép panel và xuất file — xem docs/plan.
            </div>
          </div>
        </div>
      </div>

      {showQuotation && (
        <QuotationPanel board={boardState} onClose={() => setShowQuotation(false)} />
      )}
    </div>
  )
}

// Lề khi fit bo trong khung chia đôi — dùng chung cho viewer và nhãn kích thước
// để hai bên tính ra cùng một vị trí mép bo.
const SPLIT_FIT_PADDING = 1.4


/**
 * Nhãn kích thước + số lớp, bám ngay dưới mép bo.
 * Bo được fit vào khung theo cùng công thức của viewer: chiều cao thế giới nhìn thấy
 * là max(cao, rộng/tỉ-lệ-khung) × hệ số lề. Bo bè ngang sẽ fit theo chiều rộng nên chỉ
 * chiếm một dải mỏng giữa khung — neo nhãn vào đáy khung thì nó rơi rất xa bo.
 */
const BoardBadge: React.FC<{
  bounds: BoardState['bounds']
  layerCount: number
  panel: { w: number; h: number } | null
}> = ({ bounds, layerCount, panel }) => {
  if (!bounds) return null

  let top = '88%'
  if (panel && panel.w > 0 && panel.h > 0) {
    const aspect = panel.w / 2 / panel.h // mỗi mặt chiếm nửa chiều ngang
    // Phải TRÙNG fitPadding truyền cho hai khung, nếu lệch thì nhãn rơi sai chỗ.
    const span = Math.max(bounds.heightMM, bounds.widthMM / aspect) * SPLIT_FIT_PADDING
    const frac = 0.5 + bounds.heightMM / 2 / span
    top = `calc(${Math.min(frac, 0.95) * 100}% + 20px)`
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 14px',
        borderRadius: 999,
        backgroundColor: 'rgba(15,23,42,0.9)',
        border: '1px solid #334155',
        boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        fontSize: '12px',
        fontWeight: 600,
        color: '#e2e8f0',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      <span>{layerCount} lớp</span>
      <span style={{ color: '#475569' }}>|</span>
      <span>
        {bounds.widthMM.toFixed(2)} × {bounds.heightMM.toFixed(2)} mm
      </span>
    </div>
  )
}

const AnalysisRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <tr style={{ borderBottom: '1px solid #22252e' }}>
    <td style={{ padding: '6px 0', color: '#94a3b8', fontSize: '11px' }}>{label}</td>
    <td
      style={{
        padding: '6px 0 6px 8px',
        textAlign: 'right',
        color: '#f1f5f9',
        fontWeight: 500,
        wordBreak: 'break-all',
      }}
    >
      {value}
    </td>
  </tr>
)
