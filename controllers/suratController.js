const db = require('../config/db');
const logActivity = require('../utils/logActivity');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { createNotification } = require('./notificationController');
const { broadcastActivity } = require('../websocket');
const { generateLogActivity } = require('../utils/logUtils');

// Pastikan direktori uploads/surat ada
const uploadDir = path.join(__dirname, '../uploads');
const suratDir = path.join(uploadDir, '/surat');

// Buat direktori jika belum ada
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log('Direktori uploads dibuat');
}
if (!fs.existsSync(suratDir)) {
  fs.mkdirSync(suratDir);
  console.log('Direktori uploads/surat dibuat');
}

// Konfigurasi multer untuk upload surat
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, suratDir), // Gunakan path absolut
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${timestamp}_${safeName}${ext}`);
  }
});

const uploadSurat = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file .pdf, .docx, .doc, .png, .jpg, .jpeg yang diperbolehkan'));
    }
  }
});

// Middleware upload untuk surat masuk dan keluar
const uploadFileSurat = uploadSurat.single('file');

// SIMPAN SURAT MASUK
const simpanSuratMasuk = async (req, res) => {
  uploadFileSurat(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const {
      no_agenda,
      tanggal_terima,
      tanggal_surat,
      nomor_surat,
      asal_surat,
      perihal,
      kode_surat,
      document_id
    } = req.body;

    try {
      console.log('Data yang akan disimpan:', {
        no_agenda, 
        tanggal_terima, 
        tanggal_surat,
        nomor_surat, 
        asal_surat, 
        perihal, 
        kode_surat, 
        document_id,
        user_id: req.user.id
      });
      
      // Jika ada document_id, dapatkan data dokumen untuk file_url
      let file_url = null;
      if (document_id) {
        const docResult = await db.query('SELECT file_path FROM documents WHERE id = $1', [document_id]);
        if (docResult.rows.length > 0) {
          file_url = `/uploads/${docResult.rows[0].file_path}`;
          console.log('File URL didapatkan:', file_url);
        }
      }
      
      await db.query(`
        INSERT INTO incoming_letters (
          no_agenda, tanggal_terima, tanggal_surat,
          nomor_surat, asal_surat, perihal, kode_surat, 
          document_id, user_id, file_url, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        no_agenda, tanggal_terima, tanggal_surat,
        nomor_surat, asal_surat, perihal, kode_surat, 
        document_id || null, req.user.id, file_url, 'pending'
      ]);

      await logActivity(req.user.id, `Menambahkan surat masuk dari ${asal_surat || 'tidak diketahui'}`);
      res.status(201).json({
        message: 'Surat masuk berhasil disimpan',
        data: { document_id, file_url }
      });

    } catch (err) {
      console.error('❌ Error simpan surat masuk:', err.message);
      console.error('❌ Detail error:', err);
      res.status(500).json({ error: `Gagal menyimpan surat masuk: ${err.message}` });
    }
  });
};

// SIMPAN SURAT KELUAR
const simpanSuratKeluar = async (req, res) => {
  uploadFileSurat(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const {
      no_agenda,
      tanggal_surat,
      nomor_surat,
      tujuan_surat,
      perihal,
      kode_surat,
      document_id
    } = req.body;

    try {
      console.log('Data surat keluar yang akan disimpan:', {
        no_agenda, 
        tanggal_surat,
        nomor_surat, 
        tujuan_surat, 
        perihal, 
        kode_surat, 
        document_id,
        user_id: req.user.id
      });
      
      // Jika ada document_id, dapatkan data dokumen untuk file_url
      let file_url = null;
      if (document_id) {
        const docResult = await db.query('SELECT file_path FROM documents WHERE id = $1', [document_id]);
        if (docResult.rows.length > 0) {
          file_url = `/uploads/${docResult.rows[0].file_path}`;
          console.log('File URL didapatkan:', file_url);
        }
      }

      await db.query(`
        INSERT INTO outgoing_letters (
          no_agenda, tanggal_surat, nomor_surat,
          tujuan_surat, perihal, kode_surat, document_id, user_id, file_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        no_agenda, tanggal_surat, nomor_surat,
        tujuan_surat, perihal, kode_surat, document_id || null, req.user.id, file_url
      ]);

      await logActivity(req.user.id, `Menambahkan surat keluar kepada ${tujuan_surat || 'tidak diketahui'}`);
      res.status(201).json({
        message: 'Surat keluar berhasil disimpan',
        data: { document_id, file_url }
      });

    } catch (err) {
      console.error('❌ Error simpan surat keluar:', err.message);
      console.error('❌ Detail error:', err);
      res.status(500).json({ error: `Gagal menyimpan surat keluar: ${err.message}` });
    }
  });
};

// GET SURAT MASUK
const getSuratMasuk = async (req, res) => {
  try {
    console.log('GET SURAT MASUK - User:', req.user.username, 'Role:', req.user.role);
    
    // Filter berdasarkan role dan status
    let query = '';
    let params = [];
    
    // Get request query status if provided (approved, pending, rejected)
    const statusFilter = req.query.status;
    const isAdminOrSekretaris = req.user.role === 'admin' || req.user.role === 'sekretaris';
    
    // By default, only show approved documents for all users
    if (!isAdminOrSekretaris) {
      // Regular users can only see approved documents, no matter what
      console.log('User biasa - hanya tampilkan surat approved');
      query = `
        SELECT il.*, u.username as pengirim_username 
        FROM incoming_letters il
        LEFT JOIN users u ON il.user_id = u.id
        WHERE il.status = $1 
        ORDER BY il.tanggal_terima DESC
      `;
      params = ['approved'];
    } else if (statusFilter === 'all') {
      // Untuk filter 'all', tampilkan semua dokumen
      console.log('Admin/Sekretaris filter: all - menampilkan semua dokumen');
      query = `
        SELECT il.*, u.username as pengirim_username 
        FROM incoming_letters il
        LEFT JOIN users u ON il.user_id = u.id
        ORDER BY il.tanggal_terima DESC
      `;
      params = [];
    } else if (statusFilter && ['approved', 'pending', 'rejected'].includes(statusFilter)) {
      // Admin/Sekretaris can filter by status if specified
      console.log(`Admin/Sekretaris filter by status: ${statusFilter}`);
      query = `
        SELECT il.*, u.username as pengirim_username 
        FROM incoming_letters il
        LEFT JOIN users u ON il.user_id = u.id
        WHERE il.status = $1 
        ORDER BY il.tanggal_terima DESC
      `;
      params = [statusFilter];
    } else {
      // For Admin/Sekretaris, default to showing approved documents only
      console.log('Admin/Sekretaris default view - showing approved documents');
      query = `
        SELECT il.*, u.username as pengirim_username 
        FROM incoming_letters il
        LEFT JOIN users u ON il.user_id = u.id
        WHERE il.status = $1 
        ORDER BY il.tanggal_terima DESC
      `;
      params = ['approved'];
    }
    
    console.log('Query:', query, 'Params:', params);
    const result = await db.query(query, params);
    console.log(`Jumlah surat yang ditampilkan: ${result.rows.length}`);

    // Hanya log kalau query log ≠ false
    if (req.query.log !== 'false') {
      await logActivity(req.user.id, 'Melihat laporan surat masuk');
    }

    res.status(200).json({ 
      message: 'Berhasil ambil laporan surat masuk', 
      count: result.rows.length,
      data: result.rows 
    });
  } catch (err) {
    console.error('❌ Error ambil surat masuk:', err);
    res.status(500).json({ error: 'Gagal mengambil surat masuk' });
  }
};

// GET SURAT KELUAR
const getSuratKeluar = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM outgoing_letters ORDER BY tanggal_surat DESC');

    // Hanya log kalau query log ≠ false
    if (req.query.log !== 'false') {
      await logActivity(req.user.id, 'Melihat laporan surat keluar');
    }

    res.status(200).json({ message: 'Berhasil ambil laporan surat keluar', data: result.rows });
  } catch (err) {
    console.error('❌ Error ambil surat keluar:', err);
    res.status(500).json({ error: 'Gagal mengambil surat keluar' });
  }
};

// HAPUS SURAT MASUK
const deleteSuratMasuk = async (req, res) => {
  const { id } = req.params;

  try {
    // Dapatkan info file sebelum menghapus
    const fileResult = await db.query('SELECT file_url FROM incoming_letters WHERE id = $1', [id]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Surat masuk tidak ditemukan' });
    }

    const fileUrl = fileResult.rows[0].file_url;

    // Hapus record dari database
    const result = await db.query('DELETE FROM incoming_letters WHERE id = $1', [id]);

    // Hapus file jika ada
    if (fileUrl) {
      const filePath = path.join(__dirname, '..', fileUrl.replace(/^\//, ''));
      fs.unlink(filePath, (err) => {
        if (err) console.error('Gagal menghapus file surat masuk:', err);
      });
    }

    await logActivity(req.user.id, `Menghapus surat masuk dengan ID ${id}`);
    res.status(200).json({ message: 'Surat masuk berhasil dihapus' });

  } catch (err) {
    console.error('❌ Error hapus surat masuk:', err);
    res.status(500).json({ error: 'Gagal menghapus surat masuk' });
  }
};

// HAPUS SURAT KELUAR
const deleteSuratKeluar = async (req, res) => {
  const { id } = req.params;

  try {
    // Dapatkan info file sebelum menghapus
    const fileResult = await db.query('SELECT file_url FROM outgoing_letters WHERE id = $1', [id]);

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Surat keluar tidak ditemukan' });
    }

    const fileUrl = fileResult.rows[0].file_url;

    // Hapus record dari database
    const result = await db.query('DELETE FROM outgoing_letters WHERE id = $1', [id]);

    // Hapus file jika ada
    if (fileUrl) {
      const filePath = path.join(__dirname, '..', fileUrl.replace(/^\//, ''));
      fs.unlink(filePath, (err) => {
        if (err) console.error('Gagal menghapus file surat keluar:', err);
      });
    }

    await logActivity(req.user.id, `Menghapus surat keluar dengan ID ${id}`);
    res.status(200).json({ message: 'Surat keluar berhasil dihapus' });

  } catch (err) {
    console.error('❌ Error hapus surat keluar:', err);
    res.status(500).json({ error: 'Gagal menghapus surat keluar' });
  }
};

// SIMPAN SURAT MASUK DARI USER
const simpanSuratMasukUser = async (req, res) => {
  console.log('==== SIMPAN SURAT MASUK USER - MULAI ====');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers));
  console.log('User:', req.user ? JSON.stringify(req.user) : 'Tidak ada user');
  
  uploadFileSurat(req, res, async (err) => {
    if (err) {
      console.error('❌ Error upload file:', err.message);
      return res.status(400).json({ error: err.message });
    }

    console.log('Body:', JSON.stringify(req.body));
    
    const {
      no_agenda,
      tanggal_terima,
      tanggal_surat,
      nomor_surat,
      asal_surat,
      perihal,
      kode_surat,
      document_id
    } = req.body;

    try {
      console.log('Data surat masuk user yang akan disimpan:', {
        no_agenda,
        tanggal_terima,
        tanggal_surat,
        nomor_surat,
        asal_surat,
        perihal,
        kode_surat,
        document_id,
        user_id: req.user.id,
        status: 'pending'
      });
      
      // Jika ada document_id, dapatkan data dokumen untuk file_url
      let file_url = null;
      if (document_id) {
        console.log('Mencari data dokumen dengan ID:', document_id);
        const docResult = await db.query('SELECT file_path FROM documents WHERE id = $1', [document_id]);
        if (docResult.rows.length > 0) {
          file_url = `/uploads/${docResult.rows[0].file_path}`;
          console.log('File URL didapatkan:', file_url);
        } else {
          console.warn('Dokumen dengan ID', document_id, 'tidak ditemukan');
        }
      }

      console.log('Melakukan INSERT ke tabel incoming_letters');
      // Set default status sebagai 'pending' untuk surat dari user
      const insertResult = await db.query(`
        INSERT INTO incoming_letters (
          no_agenda, tanggal_terima, tanggal_surat,
          nomor_surat, asal_surat, perihal, kode_surat, 
          document_id, status, user_id, file_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        no_agenda, tanggal_terima, tanggal_surat,
        nomor_surat, asal_surat, perihal, kode_surat, 
        document_id || null, 'pending', req.user.id, file_url
      ]);
      
      const suratId = insertResult.rows[0].id;
      console.log('Surat berhasil disimpan dengan ID:', suratId);

      await logActivity(req.user.id, `Membuat pengajuan surat masuk dari ${asal_surat || 'tidak diketahui'}`);
      
      // Kirim notifikasi ke semua sekretaris
      console.log('Mencari sekretaris untuk dikirim notifikasi...');
      const sekretarisResult = await db.query(`
        SELECT id, username FROM users WHERE role = 'sekretaris'
      `);
      
      console.log(`Ditemukan ${sekretarisResult.rows.length} sekretaris`);
      const pengirimName = req.user.username || 'user';
      
      for (const sekretaris of sekretarisResult.rows) {
        console.log(`Mengirim notifikasi ke sekretaris ${sekretaris.username} (ID: ${sekretaris.id})`);
        await createNotification(
          sekretaris.id,
          'Pengajuan Surat Baru',
          `Surat "${perihal}" dari ${pengirimName} menunggu persetujuan Anda`,
          'approval_request',
          { surat_id: suratId }
        );
        console.log(`Notifikasi dikirim ke sekretaris ${sekretaris.username} (ID: ${sekretaris.id})`);
      }
      
      // Jika tidak ada sekretaris, kirim notifikasi ke admin
      if (sekretarisResult.rows.length === 0) {
        console.log('Tidak ada sekretaris, mengirim notifikasi ke admin');
        const adminResult = await db.query(`
          SELECT id FROM users WHERE role = 'admin'
        `);
        
        for (const admin of adminResult.rows) {
          await createNotification(
            admin.id,
            'Pengajuan Surat Baru (Tidak Ada Sekretaris)',
            `Surat "${perihal}" dari ${pengirimName} menunggu persetujuan. Tidak ada sekretaris yang tersedia.`,
            'approval_request',
            { surat_id: suratId }
          );
        }
      }

      // Kirim notifikasi real-time melalui WebSocket
      broadcastActivity({
        type: 'new_document',
        document_id: suratId,
        document_type: 'masuk',
        created_by: req.user.username,
        created_at: new Date(),
        targetRole: 'sekretaris' // Kirim ke semua sekretaris
      });
      
      // Perbarui statistik untuk admin dan sekretaris
      broadcastActivity({
        type: 'statistic_update',
        targetRole: 'admin'
      });
      
      broadcastActivity({
        type: 'statistic_update',
        targetRole: 'sekretaris'
      });

      console.log('Semua proses selesai, mengirim response sukses');
      res.status(201).json({
        message: 'Surat masuk berhasil disimpan dan menunggu persetujuan',
        data: { document_id, file_url, surat_id: suratId }
      });
      console.log('==== SIMPAN SURAT MASUK USER - SELESAI ====');

    } catch (err) {
      console.error('❌ Error simpan surat masuk dari user:', err.message);
      console.error('❌ Detail error:', err);
      console.error('❌ Stack trace:', err.stack);
      res.status(500).json({ error: `Gagal menyimpan surat masuk: ${err.message}` });
      console.log('==== SIMPAN SURAT MASUK USER - ERROR ====');
    }
  });
};

// Mendapatkan daftar surat yang memerlukan persetujuan
const getPendingApprovals = async (req, res) => {
  try {
    console.log('Mengambil daftar surat yang memerlukan persetujuan...');
    console.log('User:', JSON.stringify(req.user));
    
    // Validasi user
    if (!req.user || !req.user.id) {
      console.error('Error: User tidak ditemukan dalam request');
      return res.status(401).json({
        message: 'Unauthorized: Silakan login kembali'
      });
    }
    
    // Hanya role sekretaris dan admin yang bisa mengakses
    if (req.user.role !== 'sekretaris' && req.user.role !== 'admin') {
      console.error(`Error: User ${req.user.id} dengan role ${req.user.role} mencoba mengakses getPendingApprovals`);
      return res.status(403).json({
        message: 'Akses ditolak. Anda tidak memiliki izin untuk fungsi ini.'
      });
    }

    console.log('Memeriksa tabel incoming_letters...');
    // Periksa apakah tabel incoming_letters ada
    try {
      const checkTable = await db.query('SELECT 1 FROM incoming_letters LIMIT 1');
      console.log('Tabel incoming_letters ada:', checkTable.rows.length > 0);
    } catch (tableErr) {
      console.error('Error: Tabel incoming_letters mungkin tidak ada:', tableErr);
      return res.status(500).json({ 
        message: 'Terjadi kesalahan pada database. Tabel tidak ditemukan.' 
      });
    }
    
    // Query yang disederhanakan, hanya menggunakan kolom yang ada
    const result = await db.query(`
      SELECT 
        il.id,
        il.no_agenda,
        il.tanggal_terima,
        il.tanggal_surat,
        il.nomor_surat,
        il.asal_surat,
        il.perihal,
        COALESCE(il.status, 'pending') as status,
        il.document_id,
        il.file_url,
        il.user_id,
        u.username as pengirim_username
      FROM incoming_letters il
      LEFT JOIN users u ON il.user_id = u.id
      WHERE COALESCE(il.status, 'pending') = 'pending'
      ORDER BY il.tanggal_terima DESC
    `);

    console.log('Jumlah surat yang perlu diapprove:', result.rows.length);
    
    res.status(200).json({
      message: 'Berhasil mengambil daftar surat yang memerlukan persetujuan',
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    console.error('❌ Error dalam getPendingApprovals:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ message: 'Terjadi kesalahan saat mengambil data approval' });
  }
};

// Menyetujui surat
const approveSurat = async (req, res) => {
  const { id } = req.params;
  const { catatan } = req.body;
  
  try {
    // Hanya role sekretaris yang bisa mengakses
    if (req.user.role !== 'sekretaris' && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Akses ditolak. Anda tidak memiliki izin untuk fungsi ini.'
      });
    }

    // Dapatkan info surat dan pengirimnya
    const suratInfo = await db.query(`
      SELECT sm.*, u.id as pengirim_id
      FROM incoming_letters sm
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.id = $1
    `, [id]);

    if (suratInfo.rows.length === 0) {
      return res.status(404).json({ message: 'Surat tidak ditemukan' });
    }

    const surat = suratInfo.rows[0];
    
    // Update status surat
    await db.query(`
      UPDATE incoming_letters
      SET status = 'approved', 
          approved_by = $1,
          approved_at = NOW(),
          approval_notes = $2
      WHERE id = $3
    `, [req.user.id, catatan || null, id]);

    // Kirim notifikasi ke pengirim surat
    if (surat.pengirim_id) {
      await createNotification(
        surat.pengirim_id,
        'Surat Disetujui',
        `Surat "${surat.perihal}" telah disetujui oleh sekretaris`,
        'approval_response',
        { surat_id: surat.id }
      );
    }

    // Kirim notifikasi ke admin (opsional)
    const adminUsers = await db.query(`
      SELECT id FROM users WHERE role = 'admin'
    `);

    for (const admin of adminUsers.rows) {
      await createNotification(
        admin.id,
        'Surat Baru Disetujui',
        `Surat "${surat.perihal}" telah disetujui oleh sekretaris`,
        'info',
        { surat_id: surat.id }
      );
    }

    res.status(200).json({
      message: 'Surat berhasil disetujui',
      data: { id }
    });
  } catch (err) {
    console.error('Error dalam approveSurat:', err);
    res.status(500).json({ message: err.message });
  }
};

// Menolak surat
const rejectSurat = async (req, res) => {
  const { id } = req.params;
  const { alasan } = req.body;
  
  try {
    // Hanya role sekretaris yang bisa mengakses
    if (req.user.role !== 'sekretaris' && req.user.role !== 'admin') {
      return res.status(403).json({
        message: 'Akses ditolak. Anda tidak memiliki izin untuk fungsi ini.'
      });
    }

    // Validasi alasan penolakan
    if (!alasan) {
      return res.status(400).json({
        message: 'Alasan penolakan harus diisi'
      });
    }

    // Dapatkan info surat dan pengirimnya
    const suratInfo = await db.query(`
      SELECT sm.*, u.id as pengirim_id
      FROM incoming_letters sm
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.id = $1
    `, [id]);

    if (suratInfo.rows.length === 0) {
      return res.status(404).json({ message: 'Surat tidak ditemukan' });
    }

    const surat = suratInfo.rows[0];
    
    // Update status surat
    await db.query(`
      UPDATE incoming_letters
      SET status = 'rejected', 
          rejected_by = $1,
          rejected_at = NOW(),
          rejection_reason = $2
      WHERE id = $3
    `, [req.user.id, alasan, id]);

    // Kirim notifikasi ke pengirim surat
    if (surat.pengirim_id) {
      await createNotification(
        surat.pengirim_id,
        'Surat Ditolak',
        `Surat "${surat.perihal}" ditolak dengan alasan: ${alasan}`,
        'approval_response',
        { surat_id: surat.id }
      );
    }

    res.status(200).json({
      message: 'Surat berhasil ditolak',
      data: { id }
    });
  } catch (err) {
    console.error('Error dalam rejectSurat:', err);
    res.status(500).json({ message: err.message });
  }
};

// Mendapatkan status surat
const getSuratStatus = async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log('getSuratStatus - params:', { id });
    console.log('getSuratStatus - user:', req.user);
    
    // Validasi ID surat
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ message: 'ID surat tidak valid' });
    }
    
    // Validasi user
    let userId = null;
    if (req.user && req.user.id) {
      userId = typeof req.user.id === 'string' ? parseInt(req.user.id, 10) : req.user.id;
    }
    
    // Validasi role
    const userRole = req.user && req.user.role ? req.user.role : '';
    const isAdminOrSekretaris = userRole === 'admin' || userRole === 'sekretaris';
    
    console.log('getSuratStatus - parsed:', { 
      id: parseInt(id), 
      userId, 
      userRole,
      isAdminOrSekretaris 
    });
    
    // Query dengan kondisi yang berbeda berdasarkan role
    let query, params;
    
    if (isAdminOrSekretaris) {
      // Admin dan sekretaris dapat melihat semua surat
      query = `
        SELECT 
          id, 
          nomor_surat, 
          perihal, 
          status, 
          tanggal_surat,
          approval_notes,
          rejection_reason
        FROM incoming_letters
        WHERE id = $1
      `;
      params = [id];
    } else {
      // User biasa hanya bisa melihat surat mereka sendiri
      query = `
        SELECT 
          id, 
          nomor_surat, 
          perihal, 
          status, 
          tanggal_surat,
          approval_notes,
          rejection_reason
        FROM incoming_letters
        WHERE id = $1 AND user_id = $2
      `;
      params = [id, userId];
    }
    
    console.log('getSuratStatus - Query:', query);
    console.log('getSuratStatus - Params:', params);
    
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Surat tidak ditemukan' });
    }

    res.status(200).json({
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error dalam getSuratStatus:', err);
    res.status(500).json({ message: err.message });
  }
};

// Mendapatkan daftar surat yang dikirim oleh user
const getUserSuratMasuk = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        id, 
        nomor_surat, 
        perihal, 
        status, 
        tanggal_surat,
        approval_notes,
        rejection_reason as alasan_penolakan
      FROM incoming_letters
      WHERE user_id = $1
      ORDER BY tanggal_terima DESC
    `, [req.user.id]);

    res.status(200).json({
      data: result.rows
    });
  } catch (err) {
    console.error('Error dalam getUserSuratMasuk:', err);
    res.status(500).json({ message: err.message });
  }
};

// Mendapatkan status surat untuk sidebar user
const getUserSuratStatus = async (req, res) => {
  try {
    console.log('======= DEBUG getUserSuratStatus =======');
    console.log('req.user:', JSON.stringify(req.user));
    
    // Debug info tentang token di header
    const authHeader = req.headers.authorization || '';
    console.log('Authorization header exists:', !!req.headers.authorization);
    console.log('Auth header format:', authHeader.startsWith('Bearer ') ? 'Bearer token' : 'Invalid format');
    
    // Validasi user secara menyeluruh
    if (!req.user) {
      console.error('User tidak terautentikasi');
      return res.status(401).json({
        success: false,
        message: 'User tidak terautentikasi'
      });
    }
    
    // ========== VALIDASI REQ.USER ==========
    // Dapatkan user_id yang valid dari token
    let userId = null;
    
    // Data user harus ada id, dan id harus valid
    if (req.user && typeof req.user === 'object') {
      if (req.user.id !== undefined) {
        if (typeof req.user.id === 'number') {
          userId = req.user.id;
          console.log('ID dari token valid (number):', userId);
        } 
        else if (typeof req.user.id === 'string' && /^\d+$/.test(req.user.id)) {
          userId = parseInt(req.user.id, 10);
          console.log('ID dari token valid (string numerik):', userId);
        }
        else {
          console.error('ID dari token tidak valid:', req.user.id, typeof req.user.id);
        }
      } else {
        console.error('Token tidak mengandung properti id');
      }
    } else {
      console.error('req.user bukan objek:', typeof req.user);
    }
    
    // Jika masih tidak valid, coba ambil dari query params
    if (userId === null) {
      if (req.query.userId && /^\d+$/.test(req.query.userId)) {
        userId = parseInt(req.query.userId, 10);
        console.log('Menggunakan user_id dari query params:', userId);
      }
    }
    
    // Jika setelah semua upaya, userId masih null, kembalikan error
    if (userId === null) {
      console.error('User ID tidak valid setelah semua validasi');
      return res.status(400).json({
        success: false,
        message: 'User ID tidak valid, pastikan Anda login dengan benar'
      });
    }
    
    console.log('User ID final yang digunakan:', userId);
    
    // Query yang sudah divalidasi
    const queryStr = `
      SELECT 
        id, 
        nomor_surat, 
        perihal, 
        status, 
        tanggal_terima,
        tanggal_surat,
        CASE 
          WHEN status = 'approved' THEN 'Disetujui' 
          WHEN status = 'rejected' THEN 'Ditolak' 
          ELSE 'Menunggu Persetujuan' 
        END as status_text,
        rejection_reason,
        no_agenda,
        asal_surat,
        kode_surat,
        file_url,
        approval_notes
      FROM incoming_letters
      WHERE user_id = $1
      ORDER BY tanggal_terima DESC
    `;
    
    console.log('Menjalankan query dengan user_id =', userId);
    const result = await db.query(queryStr, [userId]);
    
    console.log(`Ditemukan ${result.rows.length} surat untuk user ID ${userId}`);
    console.log('======= AKHIR DEBUG getUserSuratStatus =======');
    
    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    console.error('Error dalam getUserSuratStatus:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ 
      success: false, 
      message: err.message,
      error: err.toString()
    });
  }
};

// Ubah dari exports.updateStatus menjadi definisi fungsi biasa
function updateStatus(req, res) {
  return new Promise(async (resolve, reject) => {
    try {
      const suratId = req.params.id;
      const { status, catatan } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;
      
      // Update status surat
      const updateQuery = `
        UPDATE surat 
        SET status = ?, catatan = ?, updated_at = NOW()
        WHERE id = ?
      `;
      
      await db.query(updateQuery, [status, catatan || null, suratId]);
      
      // Dapatkan info surat untuk log dan notifikasi
      const [suratInfo] = await db.query(
        'SELECT s.*, u.username FROM surat s JOIN users u ON s.user_id = u.id WHERE s.id = ?', 
        [suratId]
      );
      
      if (suratInfo && suratInfo.length > 0) {
        const surat = suratInfo[0];
        
        // Kirim update melalui WebSocket
        broadcastActivity({
          type: 'status_update',
          action: 'update_status',
          document_id: suratId,
          status: status,
          updated_by: req.user.username,
          updated_at: new Date(),
          targetUserId: surat.user_id, // Kirim ke pengguna yang memiliki dokumen
          targetRole: 'user' // Dan ke semua user
        });
        
        // Kirim update statistik untuk sekretaris dan admin
        broadcastActivity({
          type: 'statistic_update',
          targetRole: 'sekretaris' 
        });
        
        broadcastActivity({
          type: 'statistic_update',
          targetRole: 'admin'
        });
        
        // Kirim update statistik untuk pemilik surat
        broadcastActivity({
          type: 'statistic_update',
          targetUserId: surat.user_id
        });
        
        // Generate log activity
        await generateLogActivity({
          userId,
          activity: `${userRole} ${req.user.username} mengubah status surat "${surat.judul}" menjadi ${status}`,
          module: 'surat',
          endpoint: req.originalUrl,
          method: req.method,
          status: 'success',
          data: JSON.stringify({ suratId, status })
        });
      }
      
      res.status(200).json({
        success: true,
        message: `Status surat berhasil diubah menjadi ${status}`,
        data: { id: suratId, status }
      });
      
      resolve();
    } catch (error) {
      console.error('Error updating surat status:', error);
      
      res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan saat mengubah status surat',
        error: error.message
      });
      
      reject(error);
    }
  });
}

module.exports = {
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
  getUserSuratStatus,
  updateStatus,
};