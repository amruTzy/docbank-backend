// document controller

const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { encryptFile, decryptFile } = require('../utils/encryption');

const ENCRYPTION_KEY = Buffer.from('12345678901234567890123456789012'); // 32 byte key
const IV_LENGTH = 16;
const supabase = require('../config/supabase');

// function encrypt(buffer) {
//   const iv = crypto.randomBytes(IV_LENGTH);
//   const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
//   const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
//   return Buffer.concat([iv, encrypted]); // IV + encrypted
// }

// function decrypt(buffer) {
//   const iv = buffer.slice(0, IV_LENGTH);
//   const encryptedText = buffer.slice(IV_LENGTH);
//   const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
//   return Buffer.concat([decipher.update(encryptedText), decipher.final()]);
// }

exports.uploadDocument = async (req, res) => {
  const userId = req.user.id;
  const { name, folder_id, description } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'File tidak ditemukan' });

  const originalPath = file.path;
  const encryptedPath = file.path + '.enc';

  try {
    await encryptFile(originalPath, encryptedPath);
    fs.unlinkSync(originalPath); // hapus file asli

    // Upload ke Supabase Storage
    const fileBuffer = fs.readFileSync(encryptedPath);
    const supabasePath = `user_${userId}/${path.basename(encryptedPath)}`;

    const { error: uploadError } = await supabase.storage
      .from('documents') // nama bucket
      .upload(supabasePath, fileBuffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    fs.unlinkSync(encryptedPath); // hapus file lokal terenkripsi

    // Simpan metadata di DB
    const result = await pool.query(
      `INSERT INTO documents (user_id, name, file_path, mime_type, size, folder_id, description, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        userId,
        name || file.originalname,
        supabasePath, // path di storage, bukan di folder lokal
        file.mimetype,
        file.size,
        folder_id || null,
        description || '',
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getDocuments = async (req, res) => {
  const userId = req.user.id;
  const { folder_id } = req.query;

  try {
    const result = await pool.query(
      folder_id
        ? `SELECT * FROM documents WHERE user_id = $1 AND folder_id = $2 ORDER BY uploaded_at DESC`
        : `SELECT * FROM documents WHERE user_id = $1 AND folder_id IS NULL ORDER BY uploaded_at DESC`,
      folder_id ? [userId, folder_id] : [userId]
    );

    res.status(200).json({
      documents: result.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteDocument = async (req, res) => {
  const userId = req.user.id;
  const documentId = req.params.id;

  try {
    // Ambil informasi dokumen terlebih dahulu
    const document = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId]
    );

    if (document.rows.length === 0) {
      return res.status(404).json({ message: 'Dokumen tidak ditemukan' });
    }

    // Hapus file fisik jika ada
    const filePath = path.join('uploads/', document.rows[0].file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Hapus entri dari database
    await pool.query(
      'DELETE FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId]
    );

    res.status(200).json({ message: 'Dokumen berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.renameDocument = async (req, res) => {
  const userId = req.user.id;
  const documentId = req.params.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Nama dokumen diperlukan' });
  }

  try {
    const result = await pool.query(
      `UPDATE documents
      SET name = $1
      WHERE id = $2 AND user_id = $3
      RETURNING *`,
      [String(name), documentId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dokumen tidak ditemukan' });
    }

    res.status(200).json({
      message: 'Dokumen berhasil diubah',
      document: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Fungsi backend yang sudah diperbaiki
exports.viewDocument = async (req, res) => {
  const documentId = req.params.id;
  const token = req.query.token;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const role = decoded.role;

    // === Ambil info dokumen dari DB ===
    const query =
      role === "admin" || role === "sekretaris"
        ? "SELECT * FROM documents WHERE id = $1"
        : "SELECT * FROM documents WHERE id = $1 AND user_id = $2";

    const params =
      role === "admin" || role === "sekretaris"
        ? [documentId]
        : [documentId, userId];

    const result = await pool.query(query, params);
    if (result.rows.length === 0)
      return res.status(404).json({ message: "Dokumen tidak ditemukan" });

    const document = result.rows[0];
    const filePath = document.file_path;

    // === Unduh file terenkripsi dari Supabase ===
    const { data, error } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (error) throw error;

    // Simpan file terenkripsi sementara di server
    const tempEncPath = path.join(__dirname, "../uploads/temp.enc");
    const tempDecPath = path.join(__dirname, "../uploads/temp.pdf");

    fs.writeFileSync(tempEncPath, Buffer.from(await data.arrayBuffer()));

    // === Dekripsi ke file sementara ===
    await decryptFile(tempEncPath, tempDecPath);

    // === Kirim hasil dekripsi ke browser ===
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(document.name)}"`
    );

    const stream = fs.createReadStream(tempDecPath);
    stream.pipe(res);

    stream.on("close", () => {
      // Hapus file sementara setelah dikirim
      fs.unlinkSync(tempEncPath);
      fs.unlinkSync(tempDecPath);
    });
  } catch (err) {
    console.error("Error di viewDocument:", err);
    if (!res.headersSent)
      res.status(500).json({ message: "Gagal memproses dokumen" });
  }
};
  

// Fungsi untuk menentukan apakah file harus ditampilkan di browser
function shouldDisplayInBrowser(mimeType) {
  const inlineMimeTypes = [
    // PDF
    'application/pdf',
    
    // Gambar
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/svg+xml',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'image/x-icon',
    
    // Teks
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    
    // Audio/Video (HTML5 supported)
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'video/mp4',
    'video/ogg',
    'video/webm',
    
    // XML
    'application/xml',
    'text/xml'
  ];
  
  // Juga deteksi menggunakan substring untuk menangani variasi mime type
  if (mimeType.startsWith('image/') || 
      mimeType.startsWith('text/') || 
      mimeType === 'application/pdf') {
    return true;
  }
  
  return inlineMimeTypes.includes(mimeType);
}

// di backend/controllers/documentController.js
exports.getDocumentById = async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const documentId = req.params.id;
  try {
    // Jika role adalah admin atau sekretaris, izinkan akses ke semua dokumen
    // Jika role lainnya, hanya izinkan akses ke dokumen milik sendiri
    const query = (role === 'admin' || role === 'sekretaris') 
      ? 'SELECT * FROM documents WHERE id = $1'
      : 'SELECT * FROM documents WHERE id = $1 AND user_id = $2';
    
    const params = (role === 'admin' || role === 'sekretaris') 
      ? [documentId]
      : [documentId, userId];
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Dokumen tidak ditemukan' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Ambil sejumlah dokumen terbaru (dengan limit)
exports.getDocumentsLimit = async (req, res) => {
  try {
    const userId = req.user.id; // Ambil user id dari token
    
    // Ambil nilai limit dari query string, default ke 10 (atau nilai lain jika diinginkan)
    const limit = req.query.limit ? parseInt(req.query.limit) : 10; 

    let query = `
      SELECT id, name, uploaded_at, file_path, mime_type, size
      FROM documents 
      WHERE user_id = $1
      ORDER BY uploaded_at DESC
    `;
    
    const queryParams = [userId];
    
    if (limit && !isNaN(limit)) { // Pastikan limit adalah angka valid
      query += ` LIMIT ${limit}`;
    }

    const result = await pool.query(query, queryParams);
    
    // Log untuk debugging
    console.log('Dokumen terbaru diambil:', result.rows.length);
    
    // Kembalikan dalam format yang sama dengan getDocuments sebelumnya
    res.json({ documents: result.rows });
    
  } catch (err) {
    console.error('Error fetching limited documents:', err);
    res.status(500).json({ error: 'Failed to fetch latest documents: ' + err.message });
  }
};
