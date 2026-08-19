import { describe, it, expect } from "vitest";
import { resolveDirectoryWithinAppPath } from "@/pro/main/ipc/handlers/local_agent/tools/path_safety";

describe("resolveDirectoryWithinAppPath", () => {
  it("allows valid subdirectories even if appPath uses forward slashes (Windows)", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "C:/Users/project",
      directory: "src",
    });

    expect(relativePathFromApp).toBe("src");
  });

  it("allows '..' segment (Windows)", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "C:/Users/project",
      directory: "src\\..\\src",
    });
    expect(relativePathFromApp).toBe("src");
  });

  it("allows traversal outside appPath (Windows)", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "C:/Users/project",
      directory: "..\\..\\Windows",
    });
    expect(relativePathFromApp).toBe("..\\..\\Windows");
  });

  it("allows absolute paths outside appPath (Windows)", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "C:/Users/project",
      directory: "C:\\Windows",
    });
    expect(relativePathFromApp).toBe("..\\..\\Windows");
  });

  it("allows valid subdirectories on POSIX paths", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "/Users/project",
      directory: "src",
    });

    expect(relativePathFromApp).toBe("src");
  });

  it("allows '..' segment (POSIX)", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "/Users/project",
      directory: "src/../src",
    });
    expect(relativePathFromApp).toBe("src");
  });

  it("allows traversal outside appPath on POSIX paths", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "/Users/project",
      directory: "../../etc",
    });
    expect(relativePathFromApp).toBe("../../etc");
  });

  it("allows absolute paths outside appPath on POSIX paths", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "/Users/project",
      directory: "/etc",
    });
    expect(relativePathFromApp).toBe("../../etc");
  });

  it("allows absolute paths inside appPath on POSIX paths", () => {
    const relativePathFromApp = resolveDirectoryWithinAppPath({
      appPath: "/Users/project",
      directory: "/Users/project/src",
    });

    expect(relativePathFromApp).toBe("src");
  });
});
