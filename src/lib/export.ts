// Small client-side download helpers used by Export/Print/Backup buttons.

function triggerDownload(filename: string, blob: Blob) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  triggerDownload(filename, new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
}

export function downloadJson(filename: string, data: unknown) {
  triggerDownload(
    filename,
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
}
