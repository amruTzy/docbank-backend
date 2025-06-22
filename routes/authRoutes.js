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
 * @desc    Buat user baru (admin only)
 * @access  Private (Admin)
 * ===============================
 */
router.post('/create-user', verifyToken, isAdmin, async (req, res) => {
  try {
    const newUser = await createUser(req);
    
    res.status(201).json({
      message: 'User berhasil dibuat',
      user: newUser
    });

    // Logging aktivitas
    await logActivity(req.user.id, `Membuat user baru: ${newUser.username}`);
  } catch (error) {
    console.error('Create user error:', error.message);
    res.status(400).json({ message: error.message });
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

/**
 * ===============================
 * @route   GET /api/auth/validate-token
 * @desc    Validates if a token is still valid
 * @access  Private
 * ===============================
 */
router.get('/validate-token', verifyToken, (req, res) => {
  // If verifyToken middleware passes, the token is valid
  res.status(200).json({ 
    valid: true, 
    user: { 
      id: req.user.id, 
      username: req.user.username,
      role: req.user.role 
    } 
  });
});

module.exports = router;
