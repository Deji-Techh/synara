// scripts/electron-shim.ts
// Test mock shim for Electron APIs in Vitest runs.

export const app = {
  getVersion: () => "0.0.0-test",
  getPath: (name: string) => `/tmp/${name}`,
  whenReady: () => Promise.resolve(),
  quit: () => {},
  exit: () => {},
  isPackaged: false,
};

export const ipcMain = {
  handle: () => {},
  removeHandler: () => {},
  on: () => {},
  once: () => {},
  removeListener: () => {},
  emit: () => false,
};

export const ipcRenderer = {
  invoke: () => Promise.resolve(),
  send: () => {},
  sendSync: () => null,
  on: () => {},
  once: () => {},
  removeListener: () => {},
};

export const dialog = {
  showMessageBox: () => Promise.resolve({ response: 0 }),
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showSaveDialog: () => Promise.resolve({ canceled: true }),
};

export class BrowserWindow {
  static getAllWindows = () => [];
  static getFocusedWindow = () => null;
  loadURL = () => Promise.resolve();
  loadFile = () => Promise.resolve();
  webContents = {
    send: () => {},
    on: () => {},
    once: () => {},
    removeListener: () => {},
    openDevTools: () => {},
    closeDevTools: () => {},
  };
  on = () => this;
  once = () => this;
  removeListener = () => this;
  close = () => {};
  destroy = () => {};
  isDestroyed = () => false;
  show = () => {};
  hide = () => {};
  focus = () => {};
  setBounds = () => {};
  getBounds = () => ({ x: 0, y: 0, width: 800, height: 600 });
}

export const nativeTheme = {
  themeSource: "system",
  shouldUseDarkColors: false,
  on: () => {},
  removeListener: () => {},
};

export const session = {
  defaultSession: {
    webRequest: {
      onBeforeSendHeaders: () => {},
      onHeadersReceived: () => {},
    },
  },
};

export const shell = {
  openExternal: () => Promise.resolve(),
  openPath: () => Promise.resolve(""),
  showItemInFolder: () => {},
};

export const protocol = {
  registerSchemesAsPrivileged: () => {},
  handle: () => {},
};

export const screen = {
  getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
};

export const systemPreferences = {
  getUserDefault: () => "",
};

export const Menu = {
  buildFromTemplate: () => ({ popup: () => {} }),
  setApplicationMenu: () => {},
};

export const Notification = class {
  static isSupported = () => true;
  show = () => {};
};

export const clipboard = {
  readText: () => "",
  writeText: () => {},
  readImage: () => ({ isEmpty: () => true }),
  writeImage: () => {},
};

export const nativeImage = {
  createFromPath: () => ({ isEmpty: () => false, toPNG: () => Buffer.alloc(0) }),
  createEmpty: () => ({ isEmpty: () => true }),
};

export default {
  app,
  ipcMain,
  ipcRenderer,
  dialog,
  BrowserWindow,
  nativeTheme,
  session,
  shell,
  protocol,
  screen,
  systemPreferences,
  Menu,
  Notification,
  clipboard,
  nativeImage,
};
