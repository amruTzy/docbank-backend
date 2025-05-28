// folder routes

const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folderController');
const verifyToken = require('../middleware/verifyToken');

router.get('/', verifyToken, folderController.getFolders);
router.post('/', verifyToken, folderController.createFolder);

// Tambahkan route untuk delete folder
router.delete('/:id', verifyToken, folderController.deleteFolder);

// Tambahkan route untuk rename folder
router.put('/:id', verifyToken, folderController.renameFolder);

module.exports = router;