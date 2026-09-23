/**
 * Lớp bọc quanh `web-gerber` — CHỖ DUY NHẤT trong app import thư viện này.
 *
 * Vì sao phải bọc:
 * - Nếu sau này đổi hoặc bỏ thư viện (nó dựng hình bằng three bundle sẵn, khó nâng cấp),
 *   chỉ phải viết lại file này thay vì sửa `reader.ts`, `outline.ts` và `Viewer2D.WebGL.tsx`.
 * - Gom luôn mấy mẹo phải nhớ khi dùng nó (xem `emptyObject3D`), thay vì chép lại ở từng chỗ.
 *
 * CẢNH BÁO — hai bản three trong một app:
 * web-gerber **bundle sẵn three 0.175** vào dist của nó và không import three từ ngoài.
 * Mọi Scene/Camera/Object3D nó trả ra là của bản three ĐÓ. Trộn với `three` 0.185 mà app
 * dùng (Viewer3D) sẽ crash `determinantAffine`:
 * object từ đây chỉ được đưa lại cho hàm của web-gerber. Kiểu bên dưới đều suy ra từ
 * chữ ký của chính thư viện (ReturnType) nên không lẫn với `three` của app.
 */
// @ts-ignore — file .d.ts của web-gerber không khai đủ các named export ở entry
import {
  createParser as _createParser,
  plot as _plot,
  renderThree as _renderThree,
  assemblyPCBToThreeJS as _assemblyPCBToThreeJS,
  NewRenderByElement as _NewRenderByElement,
} from 'web-gerber'

/** ImageTree — kết quả `plot()`. `size` là ô bao thô do thư viện tính. */
export type PlotResult = ReturnType<typeof _plot>
export type GerberParser = ReturnType<typeof _createParser>
/** Object3D của three BÊN TRONG web-gerber — chỉ truyền lại cho hàm của web-gerber. */
export type GerberObject3D = ReturnType<typeof _renderThree>
type RawRender = ReturnType<typeof _NewRenderByElement>
/**
 * Bộ khung dựng hình gắn vào một thẻ DOM (Scene/Camera/Renderer).
 * Camera thu về đúng loại phối cảnh: `NewRenderByElement` chỉ tạo PerspectiveCamera
 * (app dựa vào `fov`/`aspect`), còn kiểu gốc khai cả OrthographicCamera.
 */
export type GerberRender = Omit<RawRender, 'Camera'> & {
  Camera: Extract<RawRender['Camera'], { fov: number }>
}

export const createParser: typeof _createParser = _createParser
export const plot: typeof _plot = _plot
export const renderThree: typeof _renderThree = _renderThree
export const assemblyPCBToThreeJS: typeof _assemblyPCBToThreeJS = _assemblyPCBToThreeJS
export const newRenderByElement = (
  el: HTMLDivElement,
  opts: { AddAnimationLoop?: boolean; AddOrbitControls?: boolean; AddResizeListener?: boolean }
): GerberRender => _NewRenderByElement(el, opts) as GerberRender

/**
 * Đổi màu nền cảnh. Kiểu của `Scene.background` là Color | Texture | CubeTexture nên gọi
 * thẳng `.set()` không qua được TypeScript; ở đây gom một chỗ thay vì ép kiểu rải rác.
 */
export const setSceneBackground = (render: GerberRender, color: number): void => {
  const bg = render.Scene.background as { set?: (c: number) => void } | null
  bg?.set?.(color)
}

/**
 * Group RỖNG để lắp vào khe lớp không có file.
 *
 * `assemblyPCBToThreeJS` đòi mọi khe là Object3D hợp lệ, không nhận null; mà Group rỗng
 * thì phải tạo bằng chính three bên trong thư viện — cách duy nhất là plot một file Gerber
 * rỗng rồi render nó.
 */
export const emptyObject3D = (): GerberObject3D => {
  const p = createParser()
  p.feed('%FSLAX24Y24*%\n%MOMM*%\nM02*')
  return renderThree(plot(p.result(), false), 0x000000, undefined, false)
}
