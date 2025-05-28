// document routes

const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const documentController = require('../controllers/documentController');
const verifyToken = require('../middleware/verifyToken');

// Storage config (simpel)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${timestamp}_${safeName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc', '.png', '.jpg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .pdf, .docx, .png, .jpg allowed'));
    }
  }
});

router.post(
  '/',
  verifyToken,
  upload.single('file'), // field name = "file"
  documentController.uploadDocument
);

router.get(
  '/',
  verifyToken,
  documentController.getDocuments
);

// Tambahkan route untuk delete dokumen
router.delete(
  '/:id',
  verifyToken,
  documentController.deleteDocument
);

// Tambahkan route untuk rename dokumen
router.put(
  '/:id',
  verifyToken,
  documentController.renameDocument
);

// Tambahkan route untuk mengambil sejumlah dokumen terbaru
router.get('/latest', verifyToken, documentController.getDocumentsLimit);

// Route untuk melihat dokumen - verifyToken dihapus karena penanganan token sudah di controller
router.get('/:id/view', documentController.viewDocument);

// di backend/routes/documentRoutes.js
router.get('/:id', verifyToken, documentController.getDocumentById);

module.exports = router;