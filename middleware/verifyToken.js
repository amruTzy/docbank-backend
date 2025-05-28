const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]; // Format: Bearer <token>

  if (!token) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }

  try {
    // Decode token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Tambahkan validasi untuk memastikan ID adalah angka
    if (!decoded.id && decoded.id !== 0) {
      console.error('Token tidak memiliki ID valid:', decoded);
      return res.status(401).json({ message: 'Token tidak valid: missing ID' });
    }
    
    // Pastikan ID adalah number
    if (typeof decoded.id === 'string') {
      // Konversi ke number jika adalah string numerik
      if (/^\d+$/.test(decoded.id)) {
        decoded.id = parseInt(decoded.id, 10);
      } else {
        console.error('ID dalam token bukan numerik:', decoded.id);
        return res.status(401).json({ message: 'Token tidak valid: invalid ID format' });
      }
    }
    
    // Simpan decoded token ke req.user
    req.user = decoded;
    
    // Log untuk debugging
    console.log('Verified user:', { 
      id: decoded.id, 
      username: decoded.username, 
      role: decoded.role,
      id_type: typeof decoded.id
    });
    
    next();
  } catch (err) {
    console.error('Verifikasi token gagal:', err.message);
    return res.status(403).json({ message: 'Token tidak valid' });
  }
}

module.exports = verifyToken;
