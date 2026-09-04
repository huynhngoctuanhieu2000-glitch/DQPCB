import { BrowserWindow as e, Menu as t, app as n } from "electron";
import r from "node:path";
import { fileURLToPath as i } from "node:url";
//#region electron/main.ts
var a = r.dirname(i(import.meta.url));
process.env.DIST = r.join(a, "../dist"), process.env.VITE_PUBLIC = n.isPackaged ? process.env.DIST : r.join(process.env.DIST || "", "../public");
var o, s = process.env.VITE_DEV_SERVER_URL;
function c() {
	o = new e({
		width: 1280,
		height: 850,
		minWidth: 900,
		minHeight: 600,
		autoHideMenuBar: !0,
		webPreferences: { preload: r.join(a, "preload.mjs") }
	}), o.setMenu(null), o.webContents.on("did-finish-load", () => {
		o?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), o.webContents.on("console-message", (e, t, n, r, i) => {
		console.log(`[Renderer] ${n}`);
	}), s ? o.loadURL(s) : o.loadFile(r.join(process.env.DIST || "", "index.html"));
}
n.on("window-all-closed", () => {
	process.platform !== "darwin" && (n.quit(), o = null);
}), n.on("activate", () => {
	e.getAllWindows().length === 0 && c();
}), n.whenReady().then(() => {
	t.setApplicationMenu(null), c();
});
//#endregion
export {};
