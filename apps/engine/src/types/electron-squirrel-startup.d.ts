/**
 * Type declaration for electron-squirrel-startup.
 * This module exports a boolean that is `true` when the app was started
 * by Squirrel (Windows installer) during install/update/uninstall.
 * When true, the app should quit immediately.
 *
 * @see https://github.com/mongodb-js/electron-squirrel-startup
 */
declare module "electron-squirrel-startup" {
  const started: boolean;
  export = started;
}
