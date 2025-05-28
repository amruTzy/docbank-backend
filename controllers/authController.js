const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Fungsi login
const loginUser = async (req) => {
  const { username, password } = req.body;

  const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);

  if (result.rows.length === 0) {
    throw new Error('User tidak ditemukan');
  }

  const user = result.rows[0];

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error('Password salah');
  }

  await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  // Kembalikan user dan token (biar bisa dipakai di router)
  return { user, token };
};

// Fungsi create user
const createUser = async (req) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    throw new Error('Lengkapi data!');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await db.query(
    'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role',
    [username, hashedPassword, role]
  );

  return newUser.rows[0]; // kembalikan user baru
};


const logoutUser = async (userId) => {
  // Log aktivitas logout
  await db.query(
    'INSERT INTO log_activities (user_id, activity) VALUES ($1, $2)',
    [userId, 'Logout']
  );

  return { message: 'Logout berhasil dan dicatat di log' };
};


module.exports = {
  loginUser,
  createUser,
  logoutUser,
};
