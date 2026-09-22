/**
 * Nút Back của Android / vuốt lùi của iPhone đóng hộp thoại đang mở, thay vì rời
 * khỏi trang (mất hết bo đang mở).
 *
 * Cách làm: khi có ít nhất một hộp mở, đẩy MỘT mục "chặn" vào lịch sử trình duyệt.
 * Người dùng bấm Back → trình duyệt lùi về mục trước (không rời trang), popstate
 * báo về → đóng hộp trên cùng; còn hộp bên dưới thì đẩy lại mục chặn cho lần Back sau.
 * Đóng hộp bằng nút trên màn hình → khi không còn hộp nào thì tự lùi bỏ mục chặn.
 *
 * Chỉ một mục chặn dùng chung (không phải mỗi hộp một mục) và việc lùi được hoãn một
 * nhịp: React StrictMode (chạy dev) gắn–tháo–gắn lại hiệu ứng liền nhau; nếu mỗi lần
 * gắn/tháo đều đẩy/lùi lịch sử thì lệnh lùi bất đồng bộ chạy lệch khỏi lệnh đẩy.
 */
import { useEffect, useRef } from 'react'

const stack: symbol[] = []
const closers = new Map<symbol, () => void>()
let guarded = false
/** Số lần lùi do chính ta gọi — popstate sinh ra từ đó thì bỏ qua. */
let selfBack = 0

const pushGuard = () => {
  if (guarded) return
  history.pushState({ dqpcbDialog: true }, '')
  guarded = true
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (selfBack > 0) {
      selfBack--
      return
    }
    // Trình duyệt đã lùi qua mục chặn.
    guarded = false
    const top = stack.pop()
    if (top) closers.get(top)?.()
    if (stack.length > 0) pushGuard()
  })
}

export function useBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const key = Symbol('dialog')
    stack.push(key)
    closers.set(key, () => onCloseRef.current())
    pushGuard()
    return () => {
      closers.delete(key)
      const i = stack.lastIndexOf(key)
      if (i !== -1) stack.splice(i, 1)
      // Đóng bằng nút trên màn hình: hết hộp thì bỏ mục chặn. Hoãn một nhịp — nếu là
      // StrictMode gắn lại ngay, lúc đó stack đã có hộp và không lùi nữa.
      setTimeout(() => {
        if (stack.length === 0 && guarded) {
          guarded = false
          selfBack++
          history.back()
        }
      }, 0)
    }
  }, [open])
}
