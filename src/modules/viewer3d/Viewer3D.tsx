import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { BoardDataModel } from '../../models/BoardDataModel'

// 🎨 PCB COLOR THEMES
const PCB_COLORS = {
  Green: { substrate: '#0a3d24', soldermask: '#0c4d2e', name: 'Classic Green' },
  Blue: { substrate: '#0a2540', soldermask: '#0d3257', name: 'Royal Blue' },
  Red: { substrate: '#4a0e17', soldermask: '#631320', name: 'Signal Red' },
  Black: { substrate: '#121316', soldermask: '#1a1b20', name: 'Matte Black' },
  White: { substrate: '#d8dce2', soldermask: '#e5e9f0', name: 'Clean White' },
  Purple: { substrate: '#2e104d', soldermask: '#3c1566', name: 'Luxury Purple' },
}

export const Viewer3D: React.FC = () => {
  const [boardState, setBoardState] = useState(BoardDataModel.getState())
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedColor, setSelectedColor] = useState<keyof typeof PCB_COLORS>('Green')
  const [boardThickness, setBoardThickness] = useState(1.6) // 1.6mm default

  // Three.js scene refs
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const boardMeshRef = useRef<THREE.Mesh | null>(null)
  const isDragging = useRef(false)
  const isPanning = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const rotation = useRef({ x: 0.6, y: 0.6 })
  const targetPos = useRef(new THREE.Vector3(0, 0, 0))
  const cameraDistance = useRef(250)

  useEffect(() => {
    return BoardDataModel.subscribe((state) => {
      setBoardState(state)
    })
  }, [])

  // Create high-res 2D canvas texture from layer SVGs
  const createFaceTexture = useCallback(
    async (side: 'top' | 'bottom', widthMM: number, heightMM: number): Promise<THREE.CanvasTexture | null> => {
      const bounds = boardState.bounds
      if (!bounds) return null

      const canvas = document.createElement('canvas')
      const scale = 8 // High resolution: 8 pixels per mm (approx 200 DPI)
      const widthPx = Math.max(256, Math.min(4096, Math.round(widthMM * scale)))
      const heightPx = Math.max(256, Math.min(4096, Math.round(heightMM * scale)))

      canvas.width = widthPx
      canvas.height = heightPx
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      // 1. Base substrate color
      ctx.fillStyle = PCB_COLORS[selectedColor].soldermask
      ctx.fillRect(0, 0, widthPx, heightPx)

      // Filter layers for this side
      const relevantLayers = boardState.layers.filter(
        (l) =>
          boardState.visibleLayers.has(l.id) &&
          (l.side === side || l.side === 'all') &&
          l.type !== 'drawing'
      )

      // Sort by stackup order
      relevantLayers.sort((a, b) => a.order - b.order)

      for (const layer of relevantLayers) {
        try {
          const scale = layer.units === 'in' ? 1 / 25.4 : 1
          const vbMinX = bounds.minX * scale
          const vbMinY = -(bounds.minY + heightMM) * scale
          const vbWidth = widthMM * scale
          const vbHeight = heightMM * scale
          const viewBoxStr = `${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`

          let svgStr = layer.svgContent
            .replace(/viewBox="[^"]*"/, `viewBox="${viewBoxStr}" preserveAspectRatio="none"`)
            .replace(/\swidth="[^"]*"/, ` width="${widthPx}"`)
            .replace(/\sheight="[^"]*"/, ` height="${heightPx}"`)

          // Color customization for realistic 3D appearance
          let strokeFill = layer.color
          if (layer.type === 'copper') {
            strokeFill = '#c8963e' // Shiny golden copper
          } else if (layer.type === 'silkscreen') {
            strokeFill = selectedColor === 'White' ? '#111827' : '#ffffff'
          } else if (layer.type === 'outline') {
            strokeFill = '#f59e0b'
          } else if (layer.type === 'drill') {
            strokeFill = '#0a0a0a' // Punch holes
          } else if (layer.type === 'soldermask') {
            strokeFill = '#e5c07b' // Exposed shiny solder pads
          }

          svgStr = svgStr.replace(/fill="currentColor"/g, `fill="${strokeFill}"`)
          svgStr = svgStr.replace(/stroke="currentColor"/g, `stroke="${strokeFill}"`)

          const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const img = new Image()

          await new Promise<void>((resolve) => {
            img.onload = () => {
              if (side === 'bottom') {
                // Mirror horizontally for bottom view
                ctx.save()
                ctx.translate(widthPx, 0)
                ctx.scale(-1, 1)
                ctx.drawImage(img, 0, 0, widthPx, heightPx)
                ctx.restore()
              } else {
                ctx.drawImage(img, 0, 0, widthPx, heightPx)
              }
              URL.revokeObjectURL(url)
              resolve()
            }
            img.onerror = () => {
              URL.revokeObjectURL(url)
              resolve()
            }
            img.src = url
          })
        } catch (e) {
          console.warn('Could not draw layer to 3D texture:', layer.filename, e)
        }
      }

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 16
      texture.needsUpdate = true
      return texture
    },
    [boardState, selectedColor]
  )

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth || 800
    const height = container.clientHeight || 600

    // 1. Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0a0c10')
    sceneRef.current = scene

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000)
    cameraRef.current = camera

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    rendererRef.current = renderer

    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
    scene.add(ambientLight)

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.0)
    dirLight1.position.set(200, 300, 200)
    dirLight1.castShadow = true
    scene.add(dirLight1)

    const dirLight2 = new THREE.DirectionalLight(0x90b0ff, 1.2)
    dirLight2.position.set(-200, -200, -150)
    scene.add(dirLight2)

    const pointLight = new THREE.PointLight(0xffecd0, 1.5, 600)
    pointLight.position.set(0, 150, 150)
    scene.add(pointLight)

    // 5. Render Loop
    let animationFrameId: number
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)

      if (camera && boardMeshRef.current) {
        // Spherical coordinates from rotation
        const radius = cameraDistance.current
        const x = radius * Math.sin(rotation.current.y) * Math.cos(rotation.current.x)
        const y = radius * Math.sin(rotation.current.x)
        const z = radius * Math.cos(rotation.current.y) * Math.cos(rotation.current.x)

        camera.position.set(targetPos.current.x + x, targetPos.current.y + y, targetPos.current.z + z)
        camera.lookAt(targetPos.current)
      }

      renderer.render(scene, camera)
    }
    animate()

    // 6. Resize handler
    const handleResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [])

  // Build & Update 3D Board Mesh when boardState or color changes
  useEffect(() => {
    if (!sceneRef.current || !boardState.bounds) return

    const scene = sceneRef.current
    const bounds = boardState.bounds
    const widthMM = bounds.widthMM
    const heightMM = bounds.heightMM

    // Adjust camera distance to fit board
    const maxDim = Math.max(widthMM, heightMM, 50)
    cameraDistance.current = maxDim * 2.2

    let isMounted = true

    async function buildBoard() {
      // Remove previous mesh
      if (boardMeshRef.current) {
        scene.remove(boardMeshRef.current)
        boardMeshRef.current.geometry.dispose()
        if (Array.isArray(boardMeshRef.current.material)) {
          boardMeshRef.current.material.forEach((m) => m.dispose())
        }
      }

      // Generate Top and Bottom Canvas Textures
      const [topTexture, botTexture] = await Promise.all([
        createFaceTexture('top', widthMM, heightMM),
        createFaceTexture('bottom', widthMM, heightMM),
      ])

      if (!isMounted) return

      // Create 3D Box Geometry (FR4 substrate core)
      const geometry = new THREE.BoxGeometry(widthMM, boardThickness, heightMM)

      // Edge FR4 core material (yellowish green / amber fiberglass edge)
      const edgeMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#384c2a'),
        roughness: 0.7,
        metalness: 0.1,
      })

      // Top Material (with Gerber texture)
      const topMaterial = new THREE.MeshStandardMaterial({
        map: topTexture,
        roughness: 0.35,
        metalness: 0.25,
        bumpScale: 0.05,
      })

      // Bottom Material (with Gerber texture)
      const botMaterial = new THREE.MeshStandardMaterial({
        map: botTexture,
        roughness: 0.35,
        metalness: 0.25,
        bumpScale: 0.05,
      })

      // Materials array for BoxGeometry: [right, left, top(Y+), bottom(Y-), front(Z+), back(Z-)]
      const materials = [
        edgeMaterial, // +X
        edgeMaterial, // -X
        topMaterial,  // +Y (Top Face)
        botMaterial,  // -Y (Bottom Face)
        edgeMaterial, // +Z
        edgeMaterial, // -Z
      ]

      const mesh = new THREE.Mesh(geometry, materials)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      boardMeshRef.current = mesh
    }

    buildBoard()

    return () => {
      isMounted = false
    }
  }, [boardState, selectedColor, boardThickness, createFaceTexture])

  // Non-passive wheel event listener
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const zoomFactor = Math.exp(e.deltaY * 0.0015)
      cameraDistance.current = Math.max(10, Math.min(2000, cameraDistance.current * zoomFactor))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Mouse / Pointer Interaction handlers for 3D Orbiting & Panning
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 0) {
      isDragging.current = true
    } else if (e.button === 2) {
      isPanning.current = true
    }
    lastMousePos.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const dx = e.clientX - lastMousePos.current.x
    const dy = e.clientY - lastMousePos.current.y
    lastMousePos.current = { x: e.clientX, y: e.clientY }

    if (isDragging.current) {
      // 3D Orbit Rotation
      rotation.current.y -= dx * 0.008
      rotation.current.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, rotation.current.x + dy * 0.008))
    } else if (isPanning.current) {
      // 3D Pan
      const panSpeed = cameraDistance.current * 0.001
      targetPos.current.x -= dx * panSpeed
      targetPos.current.y += dy * panSpeed
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false
    isPanning.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignored
    }
  }

  // Quick camera presets
  const setCameraView = (view: 'top' | 'bottom' | 'iso' | 'front') => {
    targetPos.current.set(0, 0, 0)
    if (view === 'top') {
      rotation.current = { x: Math.PI / 2 - 0.001, y: 0 }
    } else if (view === 'bottom') {
      rotation.current = { x: -Math.PI / 2 + 0.001, y: 0 }
    } else if (view === 'iso') {
      rotation.current = { x: 0.6, y: 0.6 }
    } else if (view === 'front') {
      rotation.current = { x: 0, y: 0 }
    }
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0c10',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Top Floating Controls: PCB Color Palette Picker */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'rgba(20, 24, 30, 0.88)',
          padding: '6px 12px',
          borderRadius: '8px',
          border: '1px solid #2d3748',
          backdropFilter: 'blur(6px)',
          zIndex: 20,
        }}
      >
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Color:</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(Object.keys(PCB_COLORS) as Array<keyof typeof PCB_COLORS>).map((colorKey) => {
            const isSelected = selectedColor === colorKey
            return (
              <button
                key={colorKey}
                onClick={() => setSelectedColor(colorKey)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: PCB_COLORS[colorKey].soldermask,
                  border: isSelected ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                  transform: isSelected ? 'scale(1.2)' : 'scale(1.0)',
                  transition: 'all 0.15s ease',
                }}
                title={PCB_COLORS[colorKey].name}
              />
            )
          })}
        </div>

        <div style={{ width: '1px', height: '16px', backgroundColor: '#334155', margin: '0 4px' }} />

        {/* Thickness selector */}
        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Thickness:</span>
        <select
          value={boardThickness}
          onChange={(e) => setBoardThickness(parseFloat(e.target.value))}
          style={{
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '4px',
            fontSize: '11px',
            padding: '2px 6px',
            cursor: 'pointer',
          }}
        >
          <option value="0.8">0.8 mm</option>
          <option value="1.0">1.0 mm</option>
          <option value="1.2">1.2 mm</option>
          <option value="1.6">1.6 mm (Standard)</option>
          <option value="2.0">2.0 mm</option>
        </select>
      </div>

      {/* Bottom Right Floating Controls: 3D View Angles */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '16px',
          display: 'flex',
          gap: '6px',
          zIndex: 20,
        }}
      >
        <button
          onClick={() => setCameraView('iso')}
          style={{
            backgroundColor: '#1e293b',
            color: '#38bdf8',
            border: '1px solid #38bdf8',
            padding: '5px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Isometric 3D
        </button>
        <button
          onClick={() => setCameraView('top')}
          style={{
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            padding: '5px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Top Side
        </button>
        <button
          onClick={() => setCameraView('bottom')}
          style={{
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            padding: '5px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Bottom Side
        </button>
      </div>
    </div>
  )
}
