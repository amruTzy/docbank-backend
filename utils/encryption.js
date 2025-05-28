const crypto = require('crypto');
const fs = require('fs');

const algorithm = 'aes-256-cbc';
// Pastikan kunci dan IV konsisten antara enkripsi dan dekripsi
const key = crypto.createHash('sha256').update(String(process.env.ENCRYPTION_KEY || 'secretkey')).digest('hex').slice(0, 32);
const iv = Buffer.alloc(16, 0); // Inisialisasi IV (harus 16 byte)

exports.encryptFile = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);

      input.pipe(cipher).pipe(output);
      
      output.on('finish', () => {
        console.log(`File terenkripsi berhasil disimpan di: ${outputPath}`);
        resolve();
      });
      
      output.on('error', (err) => {
        console.error('Error saat enkripsi file:', err);
        reject(err);
      });
    } catch (err) {
      console.error('Exception saat enkripsi file:', err);
      reject(err);
    }
  });
};

exports.decryptFile = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);

      input.pipe(decipher).pipe(output);
      
      output.on('finish', () => {
        console.log(`File terdekripsi berhasil disimpan di: ${outputPath}`);
        resolve();
      });
      
      input.on('error', (err) => {
        console.error('Error saat membaca file terenkripsi:', err);
        reject(err);
      });
      
      decipher.on('error', (err) => {
        console.error('Error saat dekripsi:', err);
        reject(err);
      });
      
      output.on('error', (err) => {
        console.error('Error saat menulis file terdekripsi:', err);
        reject(err);
      });
    } catch (err) {
      console.error('Exception saat dekripsi file:', err);
      reject(err);
    }
  });
};