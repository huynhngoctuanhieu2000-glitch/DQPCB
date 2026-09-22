import { useEffect, useState } from 'react'

/**
 * Màn hẹp — điện thoại VÀ máy tính bảng (dưới 1024px): hai cột bên gộp thành bảng trượt
 * từ đáy, hộp thoại chiếm trọn màn hình, nút cỡ ngón tay.
 *
 * Mốc 1024 chứ không phải 768: ở 820px (iPad) giao diện ba cột chỉ còn 300px cho khung
 * xem bo, mà máy tính bảng cũng là màn cảm ứng. Phải khớp với các `@media (max-width:
 * 1023.98px)` trong index.css. Viết .98 chứ không phải 1023: khi trình duyệt thu phóng,
 * bề ngang có thể là 1023,4px — lọt qua `max-width: 1023px` mà chưa tới 1024.
 */
const MOBILE_QUERY = '(max-width: 1023.98px)'

export function useIsMobile(): boolean {
  const [m, setM] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}
