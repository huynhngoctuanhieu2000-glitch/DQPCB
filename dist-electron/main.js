import { BrowserWindow as e, Menu as t, app as n, dialog as r, ipcMain as i } from "electron";
import a from "node:fs/promises";
import o from "node:path";
import { fileURLToPath as s } from "node:url";
//#region electron/main.ts
var c = o.dirname(s(import.meta.url));
process.env.DIST = o.join(c, "../dist"), process.env.VITE_PUBLIC = n.isPackaged ? process.env.DIST : o.join(process.env.DIST || "", "../public");
var l, u = process.env.VITE_DEV_SERVER_URL;
function d() {
	l = new e({
		width: 1280,
		height: 850,
		minWidth: 900,
		minHeight: 600,
		autoHideMenuBar: !0,
		webPreferences: { preload: o.join(c, "preload.mjs") }
	}), l.setMenu(null), l.webContents.on("did-finish-load", () => {
		l?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), l.webContents.on("console-message", (e, t, n, r, i) => {
		console.log(`[Renderer] ${n}`);
	}), u ? l.loadURL(u) : l.loadFile(o.join(process.env.DIST || "", "index.html"));
}
n.on("window-all-closed", () => {
	process.platform !== "darwin" && (n.quit(), l = null);
}), n.on("activate", () => {
	e.getAllWindows().length === 0 && d();
}), i.handle("quotation:save", async (e, t) => {
	let n = l ? await r.showSaveDialog(l, {
		title: "Lưu báo giá",
		defaultPath: t.fileName,
		filters: [{
			name: "Excel Workbook",
			extensions: ["xlsx"]
		}]
	}) : await r.showSaveDialog({ defaultPath: t.fileName });
	return n.canceled || !n.filePath ? { canceled: !0 } : (await a.writeFile(n.filePath, Buffer.from(t.data)), {
		canceled: !1,
		filePath: n.filePath
	});
}), n.whenReady().then(() => {
	t.setApplicationMenu(null), d();
});
//#endregion
export {};
