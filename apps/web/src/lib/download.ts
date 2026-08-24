// Triggers a browser save-as for a blob response (the export endpoints
// return raw xlsx/pdf bytes, not JSON) — no <a download> in the markup,
// since the URL needs to be an object URL built from the fetched blob.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
