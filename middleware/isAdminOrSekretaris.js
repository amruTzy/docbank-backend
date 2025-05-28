module.exports = function (req, res, next) {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'sekretaris')) {
    return next();
  }
  return res.status(403).json({ message: 'Akses ditolak. Hanya admin atau sekretaris yang diizinkan.' });
}; 