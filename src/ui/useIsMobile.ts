import { useEffect, useState } from 'react'

/** Màn hẹp (điện thoại): các bảng bên thành ngăn kéo, hộp thoại chiếm trọn màn hình. */
const MOBILE_QUERY = '(max-width: 768px)'

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
