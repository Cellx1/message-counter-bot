const initSqlJs = require('sql.js');

let db = null;

async function init() {
  if (db) return db;
  const SQL = await initSqlJs();
  const fs = require('fs');
  const path = require('path');
  const DB_PATH = path.join(__dirname, 'message_counts.db');
  let buf = null;
  if (fs.existsSync(DB_PATH)) {
    buf = fs.readFileSync(DB_PATH);
  }
  db = new SQL.Database(buf);
  db.run(`
    CREATE TABLE IF NOT EXISTS message_counts (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  save();
  return db;
}

function save() {
  if (!db) return;
  const fs = require('fs');
  const path = require('path');
  const DB_PATH = path.join(__dirname, 'message_counts.db');
  const buf = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(buf));
}

async function incrementCount(guildId, userId) {
  await init();
  db.run('INSERT INTO message_counts (guild_id, user_id, count) VALUES (?, ?, 1) ON CONFLICT(guild_id, user_id) DO UPDATE SET count = count + 1', [guildId, userId]);
  save();
}

async function getCount(guildId, userId) {
  await init();
  const res = db.exec('SELECT count FROM message_counts WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (res.length === 0 || res[0].values.length === 0) return 0;
  return res[0].values[0][0];
}

module.exports = { incrementCount, getCount };
