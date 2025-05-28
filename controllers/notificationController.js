const pool = require('../config/db');

// Fungsi untuk membuat notifikasi
async function createNotification(userId, title, message, type, data = null) {
  try {
    console.log(`Mencoba membuat notifikasi: "${title}" untuk user ID ${userId}`);
    
    // Validasi parameter
    if (!userId) {
      console.error('Error creating notification: userId tidak boleh kosong');
      return false;
    }
    
    // Pastikan userId adalah integer
    const userIdInt = parseInt(userId);
    if (isNaN(userIdInt)) {
      console.error(`Error creating notification: userId invalid: ${userId}`);
      return false;
    }
    
    // Cek apakah user ada
    const userCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userIdInt]
    );
    
    if (userCheck.rows.length === 0) {
      console.error(`Error creating notification: user dengan ID ${userIdInt} tidak ditemukan`);
      return false;
    }
    
    // Konversi data ke JSON string
    let dataString = null;
    if (data) {
      try {
        dataString = JSON.stringify(data);
      } catch (jsonErr) {
        console.error('Error stringify data notifikasi:', jsonErr);
        dataString = null;
      }
    }
    
    // Insert notifikasi ke database
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, data, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userIdInt, title, message, type, dataString]
    );
    
    console.log(`✅ Notifikasi berhasil dibuat: "${title}" untuk user ID ${userIdInt}`);
    return true;
  } catch (err) {
    console.error('Error creating notification:', err);
    console.error('Notification details:', { userId, title, message, type, data });
    return false;
  }
}

// Mendapatkan semua notifikasi untuk user yang login
exports.getNotifications = async (req, res) => {
  try {
    console.log('Mengambil notifikasi untuk user:', req.user);
    
    // Validasi user
    if (!req.user || !req.user.id) {
      console.error('Error getNotifications: User tidak ditemukan dalam request');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Silakan login kembali'
      });
    }
    
    const userId = parseInt(req.user.id);
    
    // Pastikan userId adalah integer
    if (isNaN(userId)) {
      console.error(`Error getNotifications: userId invalid: ${req.user.id}`);
      return res.status(400).json({
        success: false,
        message: 'User ID tidak valid'
      });
    }
    
    // Periksa apakah tabel notifications ada
    try {
      await pool.query('SELECT 1 FROM notifications LIMIT 1');
    } catch (tableErr) {
      console.error('Error: Tabel notifications mungkin tidak ada:', tableErr);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada database. Tabel notifications tidak ditemukan.'
      });
    }
    
    const result = await pool.query(
      `SELECT id, title, message, type, is_read, created_at, data
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
      [userId]
    );
    
    console.log(`Berhasil mengambil ${result.rows.length} notifikasi untuk user ID ${userId}`);
    
    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error('Error getting notifications:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil notifikasi',
    });
  }
};

// Mendapatkan jumlah notifikasi yang belum dibaca
exports.getUnreadCount = async (req, res) => {
  try {
    console.log('Mengambil jumlah notifikasi belum dibaca untuk user:', req.user);
    
    // Validasi user
    if (!req.user || !req.user.id) {
      console.error('Error getUnreadCount: User tidak ditemukan dalam request');
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Silakan login kembali'
      });
    }
    
    const userId = parseInt(req.user.id);
    
    // Pastikan userId adalah integer
    if (isNaN(userId)) {
      console.error(`Error getUnreadCount: userId invalid: ${req.user.id}`);
      return res.status(400).json({
        success: false,
        message: 'User ID tidak valid'
      });
    }
    
    // Periksa apakah tabel notifications ada
    try {
      await pool.query('SELECT 1 FROM notifications LIMIT 1');
    } catch (tableErr) {
      console.error('Error: Tabel notifications mungkin tidak ada:', tableErr);
      return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan pada database. Tabel notifications tidak ditemukan.'
      });
    }
    
    const result = await pool.query(
      `SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    
    const count = parseInt(result.rows[0].count) || 0;
    console.log(`User ID ${userId} memiliki ${count} notifikasi yang belum dibaca`);
    
    res.status(200).json({
      success: true,
      count: count
    });
  } catch (err) {
    console.error('Error getting unread count:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengambil jumlah notifikasi',
    });
  }
};

// Menandai notifikasi sebagai telah dibaca
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    
    const result = await pool.query(
      `UPDATE notifications
      SET is_read = true
      WHERE id = $1 AND user_id = $2
      RETURNING *`,
      [notificationId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notifikasi tidak ditemukan',
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Notifikasi telah ditandai sebagai dibaca',
      data: result.rows[0],
    });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menandai notifikasi',
    });
  }
};

// Menandai semua notifikasi sebagai telah dibaca
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    
    await pool.query(
      `UPDATE notifications
      SET is_read = true
      WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    
    res.status(200).json({
      success: true,
      message: 'Semua notifikasi telah ditandai sebagai dibaca',
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menandai semua notifikasi',
    });
  }
};

// Menghapus notifikasi
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const notificationId = req.params.id;
    
    console.log(`Mencoba menghapus notifikasi ID ${notificationId} untuk user ID ${userId}`);
    
    // Validasi parameter
    if (!notificationId || isNaN(parseInt(notificationId))) {
      return res.status(400).json({
        success: false,
        message: 'ID notifikasi tidak valid',
      });
    }
    
    // Hapus notifikasi
    const result = await pool.query(
      `DELETE FROM notifications
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
      [notificationId, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notifikasi tidak ditemukan atau Anda tidak memiliki akses',
      });
    }
    
    console.log(`✅ Notifikasi ID ${notificationId} berhasil dihapus oleh user ID ${userId}`);
    
    res.status(200).json({
      success: true,
      message: 'Notifikasi berhasil dihapus',
      id: result.rows[0].id
    });
  } catch (err) {
    console.error(`Error deleting notification ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat menghapus notifikasi',
    });
  }
};

// Export createNotification untuk digunakan di controller lain
exports.createNotification = createNotification; 