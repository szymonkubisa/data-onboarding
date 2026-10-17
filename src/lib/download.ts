/** Trigger a browser download of in-memory content. Nothing leaves the machine. */
export function downloadFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** "Suppliers Q3.xlsx" → "suppliers-q3-clean.csv". */
export function exportFileName(sourceName: string, suffix: string, extension: string): string {
  const base =
    sourceName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export";
  return `${base}-${suffix}.${extension}`;
}
