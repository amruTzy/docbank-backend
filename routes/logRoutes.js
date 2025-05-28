const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Middleware untuk verifikasi token
const verifyToken = require('../middleware/verifyToken');

/**
 * ===============================
 * @route   GET /api/logs
 * @desc    Ambil 100 log aktivitas terbaru
 * @access  Private (Butuh token)
 * ===============================
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    // Ambil nilai limit dari query string, default ke 100
    const limit = parseInt(req.query.limit) || 100;

    const result = await pool.query(`
      SELECT
        la.id,
        la.activity,
        la.created_at AS timestamp,
        u.username
      FROM log_activities la
      LEFT JOIN users u ON la.user_id = u.id
      ORDER BY la.created_at DESC
      LIMIT $1
    `, [limit]); // Gunakan parameterized query

    const logs = result.rows.map((log) => ({
      id: log.id,
      username: log.username,
      activity: log.activity,
      timestamp: log.timestamp,
      type: getActivityType(log.activity),
    }));

    res.json(logs);
  } catch (err) {
    console.error('Error fetching logs:', err.message);
    res.status(500).json({ message: 'Gagal mengambil log aktivitas' });
  }
});

// Fungsi bantu untuk klasifikasi tipe log
function getActivityType(activity) {
  if (/upload/i.test(activity)) return 'upload';
  if (/login/i.test(activity)) return 'login';
  if (/hapus|delete/i.test(activity)) return 'delete';
  return 'other';
}

module.exports = router;
