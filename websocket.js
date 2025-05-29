const WebSocket = require('ws');

let wss;
// Tracking client berdasarkan userID dan role
const clients = new Map();

function initWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws, req) => {
    console.log('🟢 Client terhubung ke WebSocket');
    
    // Tangani pesan autentikasi dari client
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        // Jika pesan adalah auth, simpan client dengan userID dan role
        if (data.type === 'auth') {
          const { userId, role } = data;
          
          // Simpan informasi client
          ws.userId = userId;
          ws.role = role;
          
          // Tambahkan ke map clients
          if (!clients.has(userId)) {
            clients.set(userId, []);
          }
          clients.get(userId).push(ws);
          
          console.log(`👤 User ${userId} (${role}) terhubung ke WebSocket`);
        }
      } catch (error) {
        console.error('⚠️ Error parsing WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('🔴 Client terputus dari WebSocket');
      
      // Hapus client dari map jika sudah tidak aktif
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          const index = userClients.indexOf(ws);
          if (index !== -1) {
            userClients.splice(index, 1);
          }
          
          // Hapus entry jika tidak ada lagi koneksi aktif
          if (userClients.length === 0) {
            clients.delete(ws.userId);
          }
        }
      }
    });
  });
}

function broadcastActivity(activityData) {
  if (!wss || !wss.clients) return;
  
  // Tambahkan timestamp untuk tracking
  activityData.timestamp = Date.now();
  const message = JSON.stringify(activityData);
  
  // Tentukan penerima berdasarkan jenis aktivitas
  if (activityData.targetUserId) {
    // Kirim ke pengguna tertentu saja
    sendToUser(activityData.targetUserId, message);
  } else if (activityData.targetRole) {
    // Kirim ke semua pengguna dengan role tertentu
    sendToRole(activityData.targetRole, message);
  } else {
    // Broadcast ke semua client jika tidak ada target spesifik
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// Fungsi untuk mengirim pesan ke user tertentu
function sendToUser(userId, message) {
  const userClients = clients.get(userId);
  if (userClients && userClients.length > 0) {
    userClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// Fungsi untuk mengirim pesan ke semua user dengan role tertentu
function sendToRole(role, message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.role === role) {
      client.send(message);
    }
  });
}

module.exports = { initWebSocket, broadcastActivity, sendToUser, sendToRole };
