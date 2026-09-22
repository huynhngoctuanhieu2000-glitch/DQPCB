# Quan trọng: Outline · Drill · Slot

Ba thứ quyết định **kích thước bo (→ giá)** và **hình bo đúng hay sai**. Mọi luật dưới đây
nằm trong `src/lib/gerber-reader/` (`geometry.ts`, `outlineLoops.ts`, `identify.ts`,
`reader.ts`) và phần vẽ trong `src/modules/viewer2d/Viewer2D.WebGL.tsx`.

---

## A. Outline (viền bo)

### A1. Chọn lớp viền

- Có thể có nhiều file nhận là viền (`.GKO`, `.GM1`, `Edge_Cuts`, `Profile`, `Mechanical 1`…).
- **Chỉ lớp có ô bao lớn nhất (tính bằng mm) dựng thân bo và cho kích thước.** Các lớp viền
  khác thành tài liệu "… (viền phụ)" (ẩn, bật xem được). *(22/09, `f186434` — trước đó
  viewer lấy lớp dựng sau cùng: Slaver_Ceiling bản lẻ lấy nhầm GM1 = khung rơ-le.)*
- Corpus: 34/614 bộ có nhiều lớp viền (21 trùng khít, 13 nằm trong, 1 lấn ra ngoài).

### A2. Nối nét thành vòng (`stitchOutline`)

| Bước | Luật |
|---|---|
| Bẻ cung | Cung → đoạn thẳng (web-gerber bóp cung thành đoạn nếu để nguyên) |
| Bỏ đoạn trùng | CAM350 ghi viền 4 lần. Đoạn ngắn so sai số 0.001 mm (góc bo tròn KiCad 10 là 500 đoạn ~0.02 mm); cung so tâm + bán kính + góc giữa |
| Nối | Dung sai 0.05 mm (inch: 0.05/25.4). Ưu tiên đoạn khít tuyệt đối, theo thứ tự file; mảnh còn hở nối lại với dung sai ×10 |
| **Tách vòng "số 8"** | Chuỗi đi qua cùng một đỉnh hai lần (panel V-cut, hai bo chung cạnh) → tách thành vòng đơn. Chỉ đỉnh trùng khít và phần tách ≥ 1 mm² *(21/09)* |
| Giữ vòng | ≥ 3 đoạn (kể cả hở); 1–2 đoạn chỉ giữ khi khép kín và có cung (lỗ tròn EasyEDA = 2 cung 180°, bo tròn CAM350 = 1 cung 360°) |
| **Rãnh một nét** | Nét thẳng 1–2 đoạn, nằm hẳn trong bo (cách mép ≥ 1 mm), rộng ≥ 0.3 mm, đứng riêng, bề rộng không dùng cho đường vẽ nhiều khúc → dựng hình thuôn rộng bằng nét, thành lỗ khoét *(22/09, `706ea9f`, CHAT_BOT_4)* |
| Kích thước | Ô bao của các vòng đã nối + nửa nét — không dùng số thô (chấm lẻ Edge_Cuts KiCad làm bo 41.5 mm thành 89.68 mm) |

### A3. Vòng nào là thân bo, lỗ khoét hay nét phay (`splitOutlineLoops`)

| Loại | Luật |
|---|---|
| **Nét phay** (chỉ vẽ nét) | Chuỗi hở, nằm trong một vòng khác, khoảng hở ≥ nửa chiều dài nét (đường phay gấp khúc, vạch cắt) |
| **"Nằm trong"** | Tâm ô bao nằm trong vòng lớn hơn **và** ≥ 50% ô bao chồng lên (khấc lấn mép vài phần trăm mm vẫn tính là trong) |
| Không nằm trong vòng nào | **Thân bo** nếu to (≥ 5% vòng lớn nhất) hoặc dài như rail (≥ nửa một cạnh của cả tấm); vòng nhỏ khác (lỗ mouse-bite giữa các bo) → **lỗ khoét** |
| Nằm trong, < 5% vòng lớn nhất | **Lỗ khoét** |
| Nằm trong, ≥ 5% | Có ≥ 3 pad/đường mạch bên trong → **bo con**; không có → **lỗ khoét** (rãnh LED "3W NHUA XANH" 9.1%). Không đếm mảng phủ (CAM350 phủ đồng tràn qua chỗ phay) |

### A4. Vẽ

- Thân bo: mỗi vòng dựng riêng (web-gerber chỉ dựng một shape mỗi lần).
- Lỗ khoét: CAM vẽ trắng theo lớp Outline; 2D/3D đưa vào cụm khoan để xuyên suốt bề dày bo
  — **phải nhân 25.4 nếu viền inch** (21/09: rãnh Ceiling Master nhỏ 25 lần, không thấy).

---

## B. Drill (lỗ khoan)

### B1. Đếm lỗ (`countHoles` / `countExcellonHoles`)

- Excellon: mỗi dòng toạ độ (`X…Y…`, **cả dòng chỉ có `Y…`** hay `X…`) là một lỗ; `G85` một
  dòng; lệnh phay: mỗi lần hạ dao `M15` là một lỗ, `G00/G01` là di chuyển.
- Gerber khoan (Proteus): mỗi `D03` một lỗ + mỗi chuỗi `D02 → D01` là một rãnh.
- Số đếm quyết định file nào được vẽ và số "N lỗ" trên badge; hồi quy 21/09 khớp số hình dựng.

### B2. Chọn file khoan để vẽ

- File **một phần** (`isPartialDrillFile`): PTH, NPTH, đuôi `-PTH/-NPTH` KiCad, hoặc tách theo
  hình lỗ Altium `RoundHoles/SlotHoles/RectHoles/SquareHoles`, `Slot.txt` → **vẽ tất cả**.
- Còn lại coi là file **gộp** → chỉ vẽ file gộp nhiều lỗ nhất (KiCad xuất cả bản gộp lẫn bản tách).
- Có Excellon thì bản Gerber khoan (KiCad/Altium xuất đôi, bản vẽ khoan `.DRD` của OrCAD
  Layout) thành tài liệu — tránh đếm đôi / vẽ nhầm ký hiệu. *(OrCAD: 22/09, `11dc1bb`, 252 bộ)*
- Chọn tay "Drill" ở danh sách lớp thì file đó luôn là file khoan.
- Tất cả file khoan là con của một khung rỗng (trước đây file thứ hai bị nhân inch hai lần).

### B3. Đọc số — xem `dinh-dang-file.md` mục 4

Lỗi nặng nhất đợt này: **Altium metric `FILE_FORMAT=4:3`** bị đọc nhỏ 100 lần → mọi lỗ dồn
ngoài góc bo. 5/171 bộ Altium trong corpus bị; sửa 22/09 (`f186434`).

### B4. Vẽ

- 2D: ép cụm khoan thành lát mỏng ngay mặt đang nhìn (không thì phối cảnh kéo lỗ lệch tâm).
- 3D: trụ cao đúng bề dày bo + một lượng rất nhỏ (tránh z-fighting mất lỗ).

---

## C. Slot / rãnh / lỗ chữ nhật

| Nguồn | Dạng trong file | Đọc |
|---|---|---|
| Altium `-SlotHoles.TXT`, `-RectHoles.TXT` | Excellon phay `G00 → M15 → G01 → M16` | web-gerber dựng thành `imageRegion` (hình thuôn theo bề rộng dao); DQPCB đếm theo `M15` |
| Altium `-SquareHoles.TXT` | Toạ độ thường | Lỗ tròn (vuông khoan bằng mũi tròn) |
| Excellon `G85` | `X…Y…G85X…Y…` | Slot một dòng |
| Gerber khoan (Proteus) | `D02 → D01` | Rãnh |
| Rãnh vẽ trong **lớp viền** | Vòng kín nhỏ trong bo | Lỗ khoét (mục A3); 2D/3D đi cùng cụm khoan |
| Đường phay hở trong lớp viền | Nét hở | Nét phay (mục A3) — vẽ nét, không khoét |
| **Rãnh một nét** trong lớp viền (CHAT_BOT_4) | Một nét thẳng = đường tâm dao | CAM vẽ đúng nét; 2D/3D khoét hình thuôn rộng bằng nét (mục A2) |

Lưu ý:

- Rect hole của Altium là **rãnh phay bằng dao tròn** — góc hình chữ nhật sẽ bo theo bán kính dao.
- Số lỗ slot tính vào tổng "N lỗ" trên badge.
- Toạ độ slot Altium nằm SAU `G00/G01` — mọi luật đọc số (như FILE_FORMAT) phải dò cả ở đó
  (ESP32_DR: `RectHoles.TXT` ban đầu vẫn sai vì chỉ dò dòng bắt đầu bằng X/Y).

---

## D. Checklist khi sửa luật đọc file

1. Viết test trong `test/` dựng lại đúng dáng file thật gây lỗi.
2. Chạy `npm run build` (không chỉ `tsc --noEmit`).
3. Hồi quy corpus `D:\JobDatMach`: so bản cũ/mới — kích thước bo, số vòng + thân/lỗ/nét, số
   lỗ và tỉ lệ lỗ nằm trong bo. Xem hình cũ/mới các bộ bị đổi trước khi chốt.
4. Mở lại bộ mẫu: FC_F405RGT6_Wing (KiCad 6 lớp), BOAD NUT NHAN (EasyEDA), AGVH7 (Altium inch,
   slot), Ceiling Master / Dynamic Master (panel inch), Slaver_Ceiling bản lẻ (GKO + GM1),
   ESP32_DR (Altium metric 4:3, RectHoles), CHAT_BOT_1 (panel 4 bo), DA82 (OrCAD Layout,
   thruhole.tap + .DRD), CHAT_BOT_4 (rãnh một
   nét), PHAONUOC (đường vẽ 0.8 mm không được thành rãnh), 3W NHUA XANH (CAM350, RAR).
