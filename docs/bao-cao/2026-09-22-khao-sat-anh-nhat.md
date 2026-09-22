# Khảo sát: bo Anh Nhat — 2D/3D mất lõi bo

Ngày 22/09/2026 · Khảo sát xong được đồng ý sửa — **đã sửa ở `dbbea67`** (kết quả ở cuối).

- **Bộ file:** `D:\JobDatMach\Anh Nhat\16-08-23\Gerber Anh Nhat.zip` (Altium 23.5, inch, 15 file,
  `BAI111.*`).

## Hiện tượng

- **CAM đúng:** viền `BAI111.GKO` 80 × 75 mm, 4 góc bo tròn; 129 lỗ; mũi nhỏ nhất Ø0.30 mm.
- **2D / 3D sai:** mảng lớn góc trên bên trái và quanh cổng USB J1 bị trắng — lỗ bắt vít P5 nằm
  hẳn ra ngoài nền xanh. Chỗ trắng đúng là chỗ **không có đồng ở cả hai mặt**: lõi bo (FR-4 +
  mask) không được vẽ, phần xanh đang thấy chỉ là đồng dưới mask.

## Nguyên nhân

1. `BAI111.GKO` có, ngoài khung bo, một **vùng tô G36/G37** hình chữ nhật 19.4–37.4 × 0.3–6.6 mm
   sát mép dưới (có lẽ rãnh khoét dưới anten của Module1). Vùng này nằm **đầu tiên** trong file.
2. `stitchOutline` (`src/lib/gerber-reader/geometry.ts:413`) bọc mỗi đoạn viền đã nối vào một
   phần tử theo **mẫu** `template` = phần tử đầu tiên có đoạn trong file → ở đây là vùng tô.
   Cả 8 đoạn của khung bo thành 8 "vùng tô", mỗi vùng một đoạn.
3. Khi tô đặc (2D/3D), `renderThree` của web-gerber coi mỗi vùng là một hình riêng → 8 hình
   một đoạn, không có diện tích → **lõi bo 0 đỉnh**. Hai lớp phủ mask sao từ lõi bo cũng rỗng.
   CAM không bị vì CAM vẽ viền bằng nét, không tô.

Đã kiểm:

| | Đỉnh dựng được của thân bo |
|---|---|
| Như hiện tại (phần tử kiểu vùng tô) | **0** |
| Đổi vòng cho bắt đầu bằng đoạn thẳng | 0 (không phải do điểm bắt đầu) |
| Đổi phần tử sang kiểu nét vẽ (`imagePath`) | **2388** — dựng được |

Việc tách vòng thì đúng: một thân bo đủ khung 80 × 75 mm + một lỗ khoét 18 × 6.3 mm (rãnh
dưới Module1, đúng là khoét).

## Phạm vi

Mẫu 400 bộ ngẫu nhiên trong corpus (156 bộ đọc được): **2 bộ khác** cũng dính —
`Dao Quoc Thai\2025\01-11\Dao Quoc Thai 5pcs.zip` (2/2 vòng), `Tri Nguyen Ngoc Tung\2026\29-04\CM5-gerber.zip`
(4/4 vòng). Tức khoảng 1–2% bộ: lớp viền có vùng tô đứng trước nét vẽ.

## Đề xuất

- Ở `geometry.ts:413`: mẫu lấy **phần tử nét vẽ đầu tiên** (`imagePath`), không lấy vùng tô;
  nếu cả lớp chỉ có vùng tô thì bọc bằng kiểu nét vẽ. Sửa một dòng, không đổi cách tách vòng.
- Thêm test dựng lại đúng dáng `BAI111.GKO` (vùng tô trước khung bo), kiểm thân bo dựng ra có đỉnh.
- Hồi quy corpus: so bản cũ/mới số đỉnh thân bo — chỉ những bộ đang 0 đỉnh được đổi.

## Đã sửa (`dbbea67`)

- `geometry.ts`: mẫu bọc đoạn viền = **nét vẽ đầu tiên** (`imagePath`); lớp chỉ có vùng tô
  thì giữ như cũ.
- Test mới: vùng tô đứng trước khung bo → mọi vòng là nét vẽ, thân bo tô đặc ra có đỉnh.
- Anh Nhat: thân bo 0 → 756 đỉnh; 2D phủ kín 80 × 75 mm, 4 góc bo tròn, rãnh dưới Module1
  vẫn là lỗ khoét.
- Hồi quy 157 bộ (mẫu 400 + 3 bộ đã biết): đúng 3 bộ đổi — Anh Nhat, Dao Quoc Thai 5pcs,
  CM5-gerber — cả 3 từ lõi bo rỗng → có lõi (756 / 168 / 156 đỉnh), kích thước và cách tách
  vòng giữ nguyên. 154 bộ còn lại không đổi.
