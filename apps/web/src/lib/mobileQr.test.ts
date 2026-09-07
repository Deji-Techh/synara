import { describe, expect, it, vi } from "vitest";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async (url: string) => `data:image/png;base64,QR:${url}`),
  },
}));

import { generateQrDataUrl } from "./mobileQr";
import QRCode from "qrcode";

describe("generateQrDataUrl", () => {
  it("encodes the LAN url as a PNG data URL", async () => {
    const dataUrl = await generateQrDataUrl("http://192.168.1.76:8081/");
    expect(dataUrl).toBe("data:image/png;base64,QR:http://192.168.1.76:8081/");
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      "http://192.168.1.76:8081/",
      expect.objectContaining({ width: 240, margin: 2 }),
    );
  });
});
