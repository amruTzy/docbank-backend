const db = require('../config/db');

/**
 * Generate and save activity log
 * @param {Object} options - Options object
 * @param {number|string} options.userId - User ID
 * @param {string} options.activity - Activity description
 * @param {string} options.module - Module name (e.g., 'surat', 'user', etc.)
 * @param {string} options.endpoint - API endpoint
 * @param {string} options.method - HTTP method
 * @param {string} options.status - Status (success, failed)
 * @param {string} options.data - Additional data (JSON string)
 * @returns {Promise<void>}
 */
async function generateLogActivity(options) {
  try {
    const {
      userId,
      activity,
      module = 'system',
      endpoint = '',
      method = '',
      status = 'success',
      data = '{}'
    } = options;
    
    // Insert log into database
    await db.query(`
      INSERT INTO log_activities 
      (user_id, activity, module, endpoint, method, status, data) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, activity, module, endpoint, method, status, data]);
    
    console.log(`Log recorded: ${activity}`);
  } catch (error) {
    console.error('Error generating log activity:', error);
  }
}

module.exports = {
  generateLogActivity
}; 