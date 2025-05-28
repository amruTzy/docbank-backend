const express = require('express');
const router = express.Router();

const {
  simpanSuratMasuk,
  simpanSuratKeluar,
  getSuratMasuk,
  getSuratKeluar,
  deleteSuratMasuk,
  deleteSuratKeluar,
  simpanSuratMasukUser,
  getPendingApprovals,
  approveSurat,
  rejectSurat,
  getSuratStatus,
  getUserSuratMasuk,
  getUserSuratStatus
} = require('../controllers/suratController');

const verifyToken = require('../middleware/verifyToken');
const isAdmin = require('../middleware/isAdmin');
const isAdminOrSekretaris = require('../middleware/isAdminOrSekretaris');

// Route surat masuk dengan dukungan upload file
router.post('/surat-masuk', verifyToken, isAdmin, simpanSuratMasuk);
router.post('/surat-keluar', verifyToken, isAdmin, simpanSuratKeluar);

// Route untuk user (tanpa perlu admin)
router.post('/surat-masuk-user', verifyToken, simpanSuratMasukUser);

// Admin & User
router.get('/laporan/surat-masuk', verifyToken, getSuratMasuk);
router.get('/laporan/surat-keluar', verifyToken, getSuratKeluar);

router.delete('/surat-masuk/:id', verifyToken, isAdminOrSekretaris, deleteSuratMasuk);
router.delete('/surat-keluar/:id', verifyToken, isAdminOrSekretaris, deleteSuratKeluar);

// Endpoint baru untuk approval
router.get('/approval/pending', verifyToken, getPendingApprovals);
router.put('/approval/:id/approve', verifyToken, approveSurat);
router.put('/approval/:id/reject', verifyToken, rejectSurat);

// PENTING: Rute spesifik harus didefinisikan SEBELUM rute dengan parameter :id
router.get('/user/status', verifyToken, getUserSuratStatus);
router.get('/user/letters', verifyToken, getUserSuratMasuk);

// Rute dengan parameter id harus didefinisikan SETELAH semua rute spesifik
router.get('/:id/status', verifyToken, getSuratStatus);

module.exports = router;