// FILE: mobileQr.ts
// Purpose: Client-side QR generation for the phone preview branch.
// Layer: Web chat presentation logic
// Depends on: qrcode (data-URL output, no native deps)

import QRCode from "qrcode";

/** Renders a scannable PNG data URL for a LAN preview URL (donor: qrcode@1.5 toDataURL). */
export async function generateQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 240,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
