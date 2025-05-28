const WebSocket = require('ws');

let wss;

function initWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('🟢 Client terhubung ke WebSocket');

    ws.on('close', () => {
      console.log('🔴 Client terputus dari WebSocket');
    });
  });
}

function broadcastActivity(activityData) {
  if (wss && wss.clients) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(activityData));
      }
    });
  }
}

module.exports = { initWebSocket, broadcastActivity };
