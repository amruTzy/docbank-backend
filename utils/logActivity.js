const pool = require('../config/db');
const { broadcastActivity } = require('../websocket');

async function logActivity(user_id, activity) {
  const timestamp = new Date();

  await pool.query(
    'INSERT INTO log_activities (user_id, activity, created_at) VALUES ($1, $2, $3)',
    [user_id, activity, timestamp]
  );

  broadcastActivity({
    user_id,
    activity,
    timestamp,
  });
}

module.exports = logActivity;
