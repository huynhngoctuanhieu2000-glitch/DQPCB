import { BrowserWindow as e, Menu as t, app as n, dialog as r, ipcMain as i, shell as a } from "electron";
import o from "node:fs/promises";
import s from "node:os";
import c from "node:path";
import { fileURLToPath as l } from "node:url";
//#region electron/main.ts
var u = c.dirname(l(import.meta.url));
process.env.DIST = c.join(u, "../dist"), process.env.VITE_PUBLIC = n.isPackaged ? process.env.DIST : c.join(process.env.DIST || "", "../public");
var d, f = process.env.VITE_DEV_SERVER_URL;
function p() {
	d = new e({
		width: 1280,
		height: 850,
		minWidth: 900,
		minHeight: 600,
		autoHideMenuBar: !0,
		webPreferences: { preload: c.join(u, "preload.mjs") }
	}), d.setMenu(null), d.webContents.on("did-finish-load", () => {
		d?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), d.webContents.on("console-message", (e, t, n, r, i) => {
		console.log(`[Renderer] ${n}`);
	}), f ? d.loadURL(f) : d.loadFile(c.join(process.env.DIST || "", "index.html"));
}
n.on("window-all-closed", () => {
	process.platform !== "darwin" && (n.quit(), d = null);
}), n.on("activate", () => {
	e.getAllWindows().length === 0 && p();
}), i.handle("quotation:save", async (e, t) => {
	let n = d ? await r.showSaveDialog(d, {
		title: "Lưu báo giá",
		defaultPath: t.fileName,
		filters: [{
			name: "Excel Workbook",
			extensions: ["xlsx"]
		}]
	}) : await r.showSaveDialog({ defaultPath: t.fileName });
	return n.canceled || !n.filePath ? { canceled: !0 } : (await o.writeFile(n.filePath, Buffer.from(t.data)), {
		canceled: !1,
		filePath: n.filePath
	});
}), i.handle("quotation:pdf", async (t, n) => {
	let i = n.defaultDir ? c.join(n.defaultDir, n.fileName) : n.fileName, a = d ? await r.showSaveDialog(d, {
		title: "Lưu báo giá PDF",
		defaultPath: i,
		filters: [{
			name: "PDF",
			extensions: ["pdf"]
		}]
	}) : await r.showSaveDialog({ defaultPath: i });
	if (a.canceled || !a.filePath) return { canceled: !0 };
	let l = c.join(await o.mkdtemp(c.join(s.tmpdir(), "dqpcb-baogia-")), "bao-gia.html");
	await o.writeFile(l, n.html, "utf-8");
	let u = .3, f = new e({
		show: !1,
		width: 1065,
		height: 736,
		webPreferences: { offscreen: !0 }
	});
	try {
		await f.loadFile(l);
		let e = await f.webContents.executeJavaScript("document.body.scrollHeight"), t = Number.isFinite(e) && e > 736 ? Math.max(.55, Math.floor(736 / e * 100) / 100) : 1, n = await f.webContents.printToPDF({
			landscape: !0,
			pageSize: "A4",
			printBackground: !0,
			scale: t,
			margins: {
				top: u,
				bottom: u,
				left: u,
				right: u
			}
		});
		return await o.writeFile(a.filePath, n), {
			canceled: !1,
			filePath: a.filePath
		};
	} finally {
		f.destroy(), await o.rm(c.dirname(l), {
			recursive: !0,
			force: !0
		}).catch(() => {});
	}
}), i.handle("shell:showInFolder", (e, t) => typeof t != "string" || t === "" ? !1 : (a.showItemInFolder(t), !0)), n.whenReady().then(() => {
	t.setApplicationMenu(null), p();
});
//#endregion
export {};
