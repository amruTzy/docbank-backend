const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verifyToken');
// Import controller
const { loginUser, createUser, logoutUser } = require('../controllers/authController');

// Import middleware
const isAdmin = require('../middleware/isAdmin');

// Import utility untuk log aktivitas
const logActivity = require('../utils/logActivity');

/**
 * ===============================
 * @route   POST /api/auth/login
 * @desc    Login user (admin atau user biasa)
 * @access  Public
 * ===============================
 */
router.post('/login', async (req, res) => {
  try {
    const { user, token } = await loginUser(req); // Auth logic dari controller

    res.status(200).json({ message: 'Login berhasil', user, token });

    // Logging aktivitas login
    try {
      await logActivity(user.id, 'Login berhasil');
    } catch (logErr) {
      console.error('Gagal mencatat log aktivitas login:', logErr.message);
    }

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(401).json({ message: error.message });
  }
});

/**
 * ===============================
 * @route   POST /api/auth/create-user
 * @desc    Tambah user baru (hanya admin)
 * @access  Private (Admin Only)
 * ===============================
 */
router.post('/create-user', verifyToken, isAdmin, async (req, res) => {
  try {
    const newUser = await createUser(req); // Logic pembuatan user dari controller

    res.status(201).json({ message: 'User berhasil dibuat', user: newUser });

    // Logging aktivitas create user oleh admin
    const adminId = req.user?.id || 'unknown_admin';
    try {
      await logActivity(adminId, `Membuat user baru: ${newUser.username}`);
    } catch (logErr) {
      console.error('Gagal mencatat log aktivitas create user:', logErr.message);
    }

  } catch (error) {
    console.error('Create user error:', error.message);
    res.status(500).json({ message: 'Terjadi kesalahan saat menambahkan user baru.' });
  }
});

/**
 * ===============================
 * @route   POST /api/auth/logout
 * @desc    Mencatat aktivitas logout
 * @access  Private
 * ===============================
 */
router.post('/logout', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await logoutUser(userId);

    res.status(200).json(result);
  } catch (error) {
    console.error('Logout error:', error.message);
    res.status(500).json({ message: 'Gagal logout' });
  }
});

module.exports = router;
