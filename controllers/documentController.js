// document controller

const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { encryptFile, decryptFile } = require('../utils/encryption');

const ENCRYPTION_KEY = Buffer.from('12345678901234567890123456789012'); // 32 byte key
const IV_LENGTH = 16;

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

  const originalPath = file.path; // uploads/nama.pdf
  const encryptedPath = file.path + '.enc'; // uploads/nama.pdf.enc

  try {
    await encryptFile(originalPath, encryptedPath); // Enkripsi file
    fs.unlinkSync(originalPath); // Hapus file asli

    const result = await pool.query(
      `INSERT INTO documents (user_id, name, file_path, mime_type, size, folder_id, description, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        userId,
        name || file.originalname,
        path.basename(encryptedPath),
        file.mimetype,
        file.size,
        folder_id || null,
        description || ''
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (fs.existsSync(encryptedPath)) fs.unlinkSync(encryptedPath);
    if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
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
  try {
    console.log('viewDocument dipanggil dengan params:', req.params, 'dan query:', req.query);
    
    // Variabel untuk menyimpan ID dan role pengguna
    let userId, role;
    
    // Cek token di header atau di parameter URL
    if (req.query.token) {
      // Jika token diberikan sebagai parameter URL
      try {
        const tokenFromUrl = req.query.token;
        console.log('Token ditemukan di URL parameter:', tokenFromUrl.substring(0, 20) + '...');
        
        if (!process.env.JWT_SECRET) {
          console.error('JWT_SECRET tidak ditemukan di environment variables');
          return res.status(500).json({ message: 'Server error: Missing JWT configuration' });
        }
        
        // Coba verifikasi token
        try {
          const decoded = jwt.verify(tokenFromUrl, process.env.JWT_SECRET);
          userId = decoded.id;
          role = decoded.role;
          console.log('Autentikasi via URL parameter token berhasil untuk user:', userId, 'dengan role:', role);
        } catch (tokenVerifyError) {
          console.error('Gagal verifikasi token:', tokenVerifyError.message);
          return res.status(401).json({ message: 'Token tidak valid atau kadaluwarsa' });
        }
      } catch (tokenError) {
        console.error('Error memproses token URL:', tokenError);
        return res.status(401).json({ message: 'Token tidak valid atau kadaluwarsa' });
      }
    } else if (req.user) {
      // Jika menggunakan token dari header Authorization (cara lama)
      userId = req.user.id;
      role = req.user.role;
      console.log('Autentikasi via header token berhasil untuk user:', userId, 'dengan role:', role);
    } else {
      // Tidak ada autentikasi yang valid
      console.error('Tidak ada token ditemukan di request');
      return res.status(401).json({ message: 'Token tidak ditemukan' });
    }
    
    const documentId = req.params.id;
    // Cek apakah mode download atau inline view
    const downloadMode = req.query.download === 'true';
    const inlineMode = req.query.inline === 'true';
    console.log('Mencoba mengakses dokumen ID:', documentId, 'dengan mode download:', downloadMode, 'mode inline:', inlineMode);

    // Jika role adalah admin atau sekretaris, izinkan akses ke semua dokumen
    // Jika role lainnya, hanya izinkan akses ke dokumen milik sendiri
    const query = (role === 'admin' || role === 'sekretaris') 
      ? 'SELECT * FROM documents WHERE id = $1'
      : 'SELECT * FROM documents WHERE id = $1 AND user_id = $2';
    
    const params = (role === 'admin' || role === 'sekretaris') 
      ? [documentId]
      : [documentId, userId];
    
    console.log('Menjalankan query:', query, 'dengan params:', params);
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      console.error('Dokumen tidak ditemukan untuk ID:', documentId);
      return res.status(404).json({ message: 'Dokumen tidak ditemukan' });
    }

    const document = result.rows[0];
    // Ambil informasi penting dari database
    const fileName = document.file_path;
    // Gunakan nama file dari parameter URL jika ada, jika tidak gunakan dari database
    const originalName = req.query.filename || document.name;
    let mimeType = document.mime_type; // MIME type dokumen
    
    // Periksa ekstensi file untuk menentukan MIME type yang benar
    const fileNameLower = originalName.toLowerCase();
    // Deteksi PDF
    if (fileNameLower.endsWith('.pdf') && mimeType === 'application/octet-stream') {
      console.log('Mengganti MIME type dari application/octet-stream ke application/pdf untuk file PDF');
      mimeType = 'application/pdf';
    } 
    // Deteksi gambar
    else if (
      (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg')) && 
      mimeType === 'application/octet-stream'
    ) {
      mimeType = 'image/jpeg';
    }
    else if (fileNameLower.endsWith('.png') && mimeType === 'application/octet-stream') {
      mimeType = 'image/png';
    }
    else if (fileNameLower.endsWith('.gif') && mimeType === 'application/octet-stream') {
      mimeType = 'image/gif';
    }
    
    console.log('Dokumen ditemukan:', fileName, 'dengan nama:', originalName, 'tipe:', mimeType);
    
    // Buat path lengkap ke file terenkripsi
    const encryptedFile = path.join(__dirname, '../uploads', fileName);
    // Buat path untuk file yang akan didekripsi
    const decryptedFile = path.join(__dirname, '../uploads', fileName.replace('.enc', '.dec'));

    if (!fs.existsSync(encryptedFile)) {
      console.error('File fisik tidak ditemukan di:', encryptedFile);
      return res.status(404).json({ message: 'File tidak ditemukan' });
    }

    console.log('Mendekripsi file dari', encryptedFile, 'ke', decryptedFile);
    await decryptFile(encryptedFile, decryptedFile); // Dekripsi ke file .dec

    // Menentukan disposisi berdasarkan parameter request dan tipe mime
    let disposition;
    
    if (downloadMode) {
      // Jika parameter download=true, paksa download
      disposition = 'attachment';
    } else if (inlineMode && shouldDisplayInBrowser(mimeType)) {
      // Jika parameter inline=true dan tipe file bisa ditampilkan di browser, paksa inline
      disposition = 'inline';
    } else {
      // Default behavior berdasarkan tipe mime
      disposition = shouldDisplayInBrowser(mimeType) ? 'inline' : 'attachment';
    }
    
    console.log('Mengatur disposition:', disposition, 'untuk mimetype:', mimeType);
    
    // Set header yang sesuai
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(originalName)}"`);
    
    // Tambahkan header untuk mencegah caching (penting untuk keamanan)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    console.log('Mulai streaming file ke client');
    // Kirim file terdekripsi
    fs.createReadStream(decryptedFile).pipe(res)
      .on('finish', () => {
        // Hapus file terdekripsi setelah selesai dikirim
        if (fs.existsSync(decryptedFile)) {
          fs.unlinkSync(decryptedFile);
          console.log('File terdekripsi berhasil dihapus setelah streaming');
        }
      })
      .on('error', (err) => {
        console.error('Error streaming file:', err);
        if (!res.headersSent) {
          return res.status(500).json({ message: 'Error sending file' });
        }
      });

  } catch (err) {
    console.error('Error in viewDocument:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    }
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
