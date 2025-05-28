// folder controller

const pool = require('../config/db'); // PostgreSQL connection pool

exports.getFolders = async (req, res) => {
  const userId = req.user.id;
  const parentId = req.query.parent_id || null;

  try {
    const folders = await pool.query(
      'SELECT * FROM folders WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2',
      [userId, parentId]
    );

    const folderRows = folders.rows.map(folder => ({
      ...folder,
      name: String(folder.name),
    }));

    const documents = await pool.query(
      'SELECT * FROM documents WHERE user_id = $1 AND folder_id IS NOT DISTINCT FROM $2',
      [userId, parentId]
    );

    res.json({
      folders: folders.rows,
      documents: documents.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createFolder = async (req, res) => {
  const userId = req.user.id;
  const { name, parent_id } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO folders (user_id, name, parent_id, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [userId, String(name), parent_id || null] // 👈 paksa jadi string
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteFolder = async (req, res) => {
  const userId = req.user.id;
  const folderId = req.params.id;

  try {
    // Periksa apakah folder ada dan milik user ini
    const folder = await pool.query(
      'SELECT * FROM folders WHERE id = $1 AND user_id = $2',
      [folderId, userId]
    );

    if (folder.rows.length === 0) {
      return res.status(404).json({ message: 'Folder tidak ditemukan' });
    }

    // Periksa apakah folder kosong (tidak memiliki subfolder atau dokumen)
    const hasSubfolders = await pool.query(
      'SELECT COUNT(*) FROM folders WHERE parent_id = $1',
      [folderId]
    );

    const hasDocuments = await pool.query(
      'SELECT COUNT(*) FROM documents WHERE folder_id = $1',
      [folderId]
    );

    if (parseInt(hasSubfolders.rows[0].count) > 0 || parseInt(hasDocuments.rows[0].count) > 0) {
      return res.status(400).json({ message: 'Folder tidak kosong. Pindahkan atau hapus konten terlebih dahulu' });
    }

    // Hapus folder jika kosong
    await pool.query(
      'DELETE FROM folders WHERE id = $1 AND user_id = $2',
      [folderId, userId]
    );

    res.status(200).json({ message: 'Folder berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.renameFolder = async (req, res) => {
  const userId = req.user.id;
  const folderId = req.params.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Nama folder diperlukan' });
  }

  try {
    const result = await pool.query(
      `UPDATE folders
       SET name = $1
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [String(name), folderId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Folder tidak ditemukan' });
    }

    res.status(200).json({
      message: 'Folder berhasil diubah',
      folder: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};