const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const notificationController = require('../controllers/notificationController');

// Mendapatkan semua notifikasi untuk user yang login
router.get('/', verifyToken, notificationController.getNotifications);

// Mendapatkan jumlah notifikasi yang belum dibaca
router.get('/unread/count', verifyToken, notificationController.getUnreadCount);

// Menandai notifikasi sebagai telah dibaca
router.put('/:id/read', verifyToken, notificationController.markAsRead);

// Menandai semua notifikasi sebagai telah dibaca
router.put('/read-all', verifyToken, notificationController.markAllAsRead);

// Menghapus notifikasi
router.delete('/:id', verifyToken, notificationController.deleteNotification);

// Endpoint test untuk membuat notifikasi
router.post('/test', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Hanya admin yang boleh mengirim notifikasi test'
      });
    }
    
    const { userId, title, message } = req.body;
    
    if (!userId || !title || !message) {
      return res.status(400).json({
        success: false,
        message: 'userId, title, dan message harus diisi'
      });
    }
    
    const result = await notificationController.createNotification(
      userId,
      title,
      message,
      'test',
      { test: true, timestamp: new Date().toISOString() }
    );
    
    if (result) {
      res.status(200).json({
        success: true,
        message: 'Notifikasi test berhasil dikirim'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Gagal mengirim notifikasi test'
      });
    }
  } catch (err) {
    console.error('Error sending test notification:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat mengirim notifikasi test'
    });
  }
});

module.exports = router; 