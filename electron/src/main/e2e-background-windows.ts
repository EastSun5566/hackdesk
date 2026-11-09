import { app, BrowserWindow } from 'electron';

/**
 * Local e2e runs set HACKDESK_E2E_BACKGROUND=1 (see electron/playwright.config.ts) so the
 * suite stays out of the way: no Dock icon, no app activation, and windows that are neither
 * visible nor clickable. Playwright drives pages over the DevTools protocol, so clicks, typing
 * and screenshots work as usual. Packaged builds ignore the variable.
 */
export function keepE2EWindowsInBackground() {
  if (app.isPackaged || process.env.HACKDESK_E2E_BACKGROUND !== '1') return;

  if (process.platform === 'darwin') {
    // Accessory apps have no Dock icon and never take the menu bar. The app asks for 'regular'
    // when it shows its main window; stay in the background instead.
    const setActivationPolicy = app.setActivationPolicy.bind(app);
    app.setActivationPolicy = () => setActivationPolicy('accessory');
    app.show = () => {};
    app.focus = () => {};
    void app.whenReady().then(() => setActivationPolicy('accessory'));
  }

  BrowserWindow.prototype.show = function show(this: BrowserWindow) {
    this.showInactive();
  };
  BrowserWindow.prototype.focus = () => {};
  BrowserWindow.prototype.moveTop = () => {};

  app.on('browser-window-created', (_event, window) => {
    // Still "shown", so pages render and keep their timers, but invisible and click-through.
    window.setOpacity(0);
    window.setIgnoreMouseEvents(true);
    window.webContents.setBackgroundThrottling(false);
  });
}
