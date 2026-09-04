# PHA 4 — DFM RULE CHECK TỰ ĐỘNG

## Mục tiêu
Chạy các **luật kiểm tra khả năng sản xuất (Design For Manufacturing)** tự động trên bo mạch, giống chức năng lõi của HQDFM. Tạo báo cáo lỗi/cảnh báo có thể click-to-locate.

## Phạm vi (danh mục rule cơ bản)
1. **Minimum trace width** — chiều rộng đường mạch tối thiểu (ví dụ ≥ 0.1 mm).
2. **Minimum spacing / clearance** — khoảng cách copper-copper.
3. **Minimum drill size** — đường kính lỗ khoan nhỏ nhất (≥ 0.2 mm).
4. **Annular ring** — vành đồng quanh lỗ (≥ 0.15 mm mỗi bên).
5. **Board edge clearance** — copper cách mép bo (GKO/GM1) tối thiểu.
6. **Soldermask sliver** — mảnh mask quá nhỏ giữa 2 pad.
7. **Silkscreen on pad** — chữ in đè lên pad hàn.
8. **Drill-to-drill spacing** — 2 lỗ khoan quá gần.
9. **Copper island** — vùng đồng không kết nối (floating copper).
10. **Acid trap** — góc nhọn giữ acid trong quá trình etching.

Mỗi rule có: **giá trị mặc định theo capability nhà máy**, **preset (JLCPCB / PCBWay / Custom)**, **bật/tắt riêng**.

## Thư viện đề xuất
| Nhu cầu | Thư viện |
|---|---|
| Boolean 2D (offset, intersect) | **Clipper2** |
| Polygon offset (minkowski) | Clipper2 (`InflatePaths`) |
| Spatial query | **`rbush`** |
| Rule engine (nếu muốn khai báo declarative) | JSON schema tự định nghĩa |

## Việc cần làm
- [ ] Định nghĩa data model `DfmRule { id, name, params, severity, enabled }`.
- [ ] Preset rule sets: JLCPCB 2-layer, JLCPCB 4-layer, PCBWay standard.
- [ ] Implement từng rule dựa trên geometry của Pha 1 (dùng Clipper2 offset để tìm violation).
- [ ] Sidebar hiển thị danh sách violation: severity, mô tả, vị trí (x,y).
- [ ] Click violation → highlight trên 2D & 3D, camera zoom-to-fit.
- [ ] Xuất báo cáo HTML/PDF (→ Pha 6).

## Tiêu chí hoàn thành (DoD)
- Chạy 10 rule cơ bản trên bo 100×100 mm trong < 5 s.
- Có preset ≥ 2 nhà máy (JLC, PCBWay).
- Không báo false-positive quá 5% so với kiểm tra thủ công.
