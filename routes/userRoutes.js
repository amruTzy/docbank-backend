const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // asumsi kamu pakai PostgreSQL dan ini file koneksi DB
const verifyToken = require('../middleware/verifyToken');
const isAdmin = require('../middleware/isAdmin');

router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, role, last_login AS "lastLogin" FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  const userId = req.params.id;

  try {
    // Hapus notifikasi terkait user terlebih dahulu
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    
    // Set NULL pada semua referensi di incoming_letters
    await pool.query('UPDATE incoming_letters SET approved_by = NULL WHERE approved_by = $1', [userId]);
    
    // Set NULL pada semua referensi di outgoing_letters (jika ada)
    try {
      await pool.query('UPDATE outgoing_letters SET created_by = NULL WHERE created_by = $1', [userId]);
    } catch (err) {
      console.log('Info: Tidak ada referensi di outgoing_letters atau kolom tidak ada');
    }
    
    // Setelah semua referensi dihapus/diupdate, baru hapus user
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Gagal menghapus user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  const userId = req.params.id;
  const { username, role } = req.body;

  if (!username || !role) {
    return res.status(400).json({ error: 'Username dan role wajib diisi' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET username = $1, role = $2 WHERE id = $3 RETURNING *',
      [username, role, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    res.status(200).json({ message: 'User berhasil diupdate', user: result.rows[0] });
  } catch (err) {
    console.error('Gagal update user:', err);
    res.status(500).json({ error: 'Terjadi kesalahan pada server' });
  }
});

module.exports = router;
