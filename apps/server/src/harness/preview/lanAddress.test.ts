import type { NetworkInterfaceInfo } from "node:os";
import { describe, it, expect } from "vitest";

import { selectLanAddress, toLanUrl } from "./lanAddress.ts";

function iface(address: string, extra: Partial<NetworkInterfaceInfo> = {}): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    mac: "00:00:00:00:00:00",
    internal: false,
    cidr: `${address}/24`,
    family: "IPv4",
    scopeid: undefined,
    ...extra,
  } as NetworkInterfaceInfo;
}

describe("selectLanAddress", () => {
  it("prefers 192.168 over other private ranges", () => {
    expect(
      selectLanAddress({
        eth0: [iface("10.0.0.5")],
        wlan0: [iface("192.168.1.76")],
      }),
    ).toBe("192.168.1.76");
  });

  it("deprioritizes docker/virtual interfaces below real LANs, never link-local", () => {
    expect(
      selectLanAddress({
        lo: [iface("127.0.0.1", { internal: true })],
        docker0: [iface("172.17.0.1")],
        eth0: [iface("169.254.10.20")],
        wlan0: [iface("192.168.1.76")],
      }),
    ).toBe("192.168.1.76");
  });

  it("falls back to a docker bridge rather than nothing", () => {
    expect(
      selectLanAddress({
        docker0: [iface("172.17.0.1")],
      }),
    ).toBe("172.17.0.1");
  });

  it("returns null when nothing usable exists", () => {
    expect(selectLanAddress({})).toBeNull();
  });
});

describe("toLanUrl", () => {
  it("rewrites loopback hosts preserving port, path, and query", () => {
    expect(toLanUrl("http://localhost:8081/?foo=1", "192.168.1.76")).toBe(
      "http://192.168.1.76:8081/?foo=1",
    );
    expect(toLanUrl("http://0.0.0.0:8080/app", "10.0.0.5")).toBe("http://10.0.0.5:8080/app");
  });

  it("rejects non-local and non-http URLs", () => {
    expect(toLanUrl("http://example.com:8081/", "192.168.1.76")).toBeNull();
    expect(toLanUrl("exp://192.168.1.76:8081", "192.168.1.76")).toBeNull();
    expect(toLanUrl("not a url", "192.168.1.76")).toBeNull();
  });
});
