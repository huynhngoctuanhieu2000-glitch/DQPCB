import { BrowserWindow as e, Menu as t, app as n, dialog as r, ipcMain as i } from "electron";
import a from "node:fs/promises";
import o from "node:os";
import s from "node:path";
import { fileURLToPath as c } from "node:url";
//#region electron/main.ts
var l = s.dirname(c(import.meta.url));
process.env.DIST = s.join(l, "../dist"), process.env.VITE_PUBLIC = n.isPackaged ? process.env.DIST : s.join(process.env.DIST || "", "../public");
var u, d = process.env.VITE_DEV_SERVER_URL;
function f() {
	u = new e({
		width: 1280,
		height: 850,
		minWidth: 900,
		minHeight: 600,
		autoHideMenuBar: !0,
		webPreferences: { preload: s.join(l, "preload.mjs") }
	}), u.setMenu(null), u.webContents.on("did-finish-load", () => {
		u?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), u.webContents.on("console-message", (e, t, n, r, i) => {
		console.log(`[Renderer] ${n}`);
	}), d ? u.loadURL(d) : u.loadFile(s.join(process.env.DIST || "", "index.html"));
}
n.on("window-all-closed", () => {
	process.platform !== "darwin" && (n.quit(), u = null);
}), n.on("activate", () => {
	e.getAllWindows().length === 0 && f();
}), i.handle("quotation:save", async (e, t) => {
	let n = u ? await r.showSaveDialog(u, {
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
}), i.handle("quotation:pdf", async (t, n) => {
	let i = u ? await r.showSaveDialog(u, {
		title: "Lưu báo giá PDF",
		defaultPath: n.fileName,
		filters: [{
			name: "PDF",
			extensions: ["pdf"]
		}]
	}) : await r.showSaveDialog({ defaultPath: n.fileName });
	if (i.canceled || !i.filePath) return { canceled: !0 };
	let c = s.join(await a.mkdtemp(s.join(o.tmpdir(), "dqpcb-baogia-")), "bao-gia.html");
	await a.writeFile(c, n.html, "utf-8");
	let l = .3, d = new e({
		show: !1,
		width: 1065,
		height: 736,
		webPreferences: { offscreen: !0 }
	});
	try {
		await d.loadFile(c);
		let e = await d.webContents.executeJavaScript("document.body.scrollHeight"), t = Number.isFinite(e) && e > 736 ? Math.max(.55, Math.floor(736 / e * 100) / 100) : 1, n = await d.webContents.printToPDF({
			landscape: !0,
			pageSize: "A4",
			printBackground: !0,
			scale: t,
			margins: {
				top: l,
				bottom: l,
				left: l,
				right: l
			}
		});
		return await a.writeFile(i.filePath, n), {
			canceled: !1,
			filePath: i.filePath
		};
	} finally {
		d.destroy(), await a.rm(s.dirname(c), {
			recursive: !0,
			force: !0
		}).catch(() => {});
	}
}), n.whenReady().then(() => {
	t.setApplicationMenu(null), f();
});
//#endregion
export {};
