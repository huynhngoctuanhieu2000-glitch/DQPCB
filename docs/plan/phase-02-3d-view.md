# PHA 2 — HIỂN THỊ 3D BO MẠCH

## Mục tiêu
Dựng và hiển thị **mô hình 3D** của bo mạch từ dữ liệu Gerber + Excellon đã parse ở [Pha 1](phase-01-gerber-2d-viewer.md). Hỗ trợ xem **top / bottom / xoay tự do**, mô phỏng **stack-up nhiều lớp** (đồng, phủ xanh, in lụa, chất nền FR-4).

## Phạm vi
- Dựng mesh 3D cho từng lớp:
  - **Substrate (FR-4)** — extrude từ lớp Board Outline (GKO/GM1) theo độ dày bo (mặc định 1.6 mm, chỉnh được).
  - **Copper Top/Bottom** — extrude từ lớp copper.
  - **Soldermask Top/Bottom** — extrude từ mask, màu xanh/đỏ/đen/tím/trắng… chọn được.
  - **Silkscreen Top/Bottom** — extrude từ silk, mặc định trắng.
  - **Drill holes** — khoan xuyên substrate (boolean subtract).
- Camera: xoay (orbit), zoom, pan; nút **Top view / Bottom view / Perspective**.
- Ánh sáng: 1 directional + ambient; bật/tắt shadow.
- Chuyển qua lại giữa 2D và 3D không cần load lại file.

## Thư viện đề xuất (GitHub, MIT)
| Nhu cầu | Thư viện | Repo |
|---|---|---|
| 3D engine trong Electron/web | **three.js** | github.com/mrdoob/three.js |
| Boolean 3D (khoan lỗ, cắt outline) | **three-bvh-csg** hoặc **manifold-3d** | github.com/gkjohnson/three-bvh-csg / github.com/elalish/manifold |
| Extrude polygon → mesh | `THREE.ExtrudeGeometry` (có sẵn trong three.js) | — |
| Tam giác hóa polygon phức tạp (có lỗ) | **earcut** | github.com/mapbox/earcut |
| Tham khảo/So sánh: PCB → 3D có sẵn | **`kicanvas`** (viewer 3D KiCad), **`tracespace`** | github.com/theacodes/kicanvas |

## Việc cần làm
- [ ] Chuyển dữ liệu polygon 2D (Pha 1) → geometry 3D bằng `earcut` + `ExtrudeGeometry`.
- [ ] Định nghĩa **stack-up** (thứ tự & độ dày các lớp): substrate → copper → mask → silk.
- [ ] Boolean subtract lỗ khoan (Excellon) khỏi substrate & copper.
- [ ] Material: FR-4 (opaque/transparent switch), copper (gold-plated tuỳ chọn), mask (nhiều màu), silk trắng.
- [ ] Controls: `OrbitControls` của three.js.
- [ ] Preset view: Top / Bottom / 3D iso / Flip.
- [ ] Tuỳ chọn hiển thị: ẩn/hiện từng lớp, đổi màu mask/silk.
- [ ] Hiệu năng: LOD hoặc merge geometry, target ≥ 30 FPS ở bo phức tạp.

## Tiêu chí hoàn thành (DoD)
- Bo mạch hiển thị 3D giống ảnh render của HQDFM/JLCPCB preview.
- Lỗ khoan xuyên thấu đúng vị trí.
- Xoay 3D mượt (≥ 30 FPS) ở bo ~5000 pad.
- Chuyển view Top/Bottom không mất > 300 ms.
