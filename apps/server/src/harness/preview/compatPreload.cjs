// Compat preload for dev servers (e.g. Expo CLI with hoisted ws v7)
try {
  const ws = require("ws");
  if (ws && !ws.WebSocketServer && ws.Server) {
    ws.WebSocketServer = ws.Server;
  }
} catch {}
