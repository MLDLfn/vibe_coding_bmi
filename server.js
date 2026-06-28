const express = require('express');
const initSqlJs = require('sql.js');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DB_PATH = './bmi_tracker.db';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date TEXT DEFAULT (datetime('now', 'localtime')),
        gender TEXT NOT NULL,
        height REAL NOT NULL,
        weight REAL NOT NULL,
        age INTEGER NOT NULL,
        bmi REAL NOT NULL,
        label TEXT NOT NULL,
        color TEXT NOT NULL,
        note TEXT DEFAULT '無備註',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);
    `);
    saveDB();
  }
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function hashPassword(password) {
  return password;
}

function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const stmt = db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)');
  stmt.bind([sessionId, userId, expiresAt]);
  stmt.step();
  stmt.free();
  saveDB();
  return sessionId;
}

function getCurrentUser(req) {
  const sessionId = req.headers['x-session-id'] || (req.cookies ? req.cookies.session : null);
  if (!sessionId) return null;
  try {
    const stmt = db.prepare(`
      SELECT s.id, s.user_id, s.expires_at, u.username, u.id as uid
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now', 'localtime')
    `);
    stmt.bind([sessionId]);
    const hasRow = stmt.step();
    const row = hasRow ? stmt.getAsObject() : null;
    stmt.free();
    if (!row || !row.id) return null;
    return { id: row.uid, username: row.username, sessionId: row.id };
  } catch (e) {
    console.error('getCurrentUser error', e);
    return null;
  }
}

function getUserById(id) {
  try {
    const stmt = db.prepare('SELECT id, username FROM users WHERE id = ?');
    stmt.bind([id]);
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  } catch (e) {
    return null;
  }
}

const authMiddleware = (req, res, next) => {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: '未登入或登入已過期' });
  req.user = user;
  next();
};

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '請填寫使用者名稱與密碼' });
  if (username.length < 3) return res.status(400).json({ error: '使用者名稱至少需要 3 個字元' });
  try {
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    stmt.bind([username, hashPassword(password)]);
    stmt.step();
    stmt.free();
    saveDB();
    const verifyStmt = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?');
    verifyStmt.bind([username]);
    verifyStmt.step();
    const userRow = verifyStmt.getAsObject();
    verifyStmt.free();
    if (!userRow) {
      throw new Error('Insert failed');
    }
    const sessionId = createSession(userRow.id);
    res.json({ success: true, user: { username: userRow.username, id: userRow.id }, sessionId });
  } catch (e) {
    res.status(400).json({ error: '此使用者名稱已被註冊' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const stmt = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?');
    stmt.bind([username]);
    const hasRow = stmt.step();
    const row = hasRow ? stmt.getAsObject() : null;
    stmt.free();
    if (!row) {
      return res.status(401).json({ error: '使用者名稱或密碼錯誤' });
    }
    if (row.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: '使用者名稱或密碼錯誤' });
    }
    db.run('DELETE FROM sessions WHERE user_id = ' + row.id);
    const sessionId = createSession(row.id);
    res.json({ success: true, user: { username: row.username, id: row.id }, sessionId });
  } catch (e) {
    res.status(401).json({ error: '使用者名稱或密碼錯誤' });
  }
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  res.json({ username: user ? user.username : req.user.username, id: req.user.id });
});

app.post('/api/logout', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.bind([req.user.sessionId]);
    stmt.step();
    stmt.free();
    saveDB();
  } catch (e) {}
  res.json({ success: true });
});

app.get('/api/records', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM records WHERE user_id = ? ORDER BY datetime(created_at) DESC');
    stmt.bind([req.user.id]);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '讀取紀錄失敗' });
  }
});

app.post('/api/records', authMiddleware, (req, res) => {
  const { gender, height, weight, age, bmi, label, color, note } = req.body;
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
  try {
    const stmt = db.prepare(
      'INSERT INTO records (user_id, gender, height, weight, age, bmi, label, color, note, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.bind([req.user.id, gender, height, weight, age, bmi, label, color, note || '無備註', localNow]);
    stmt.step();
    stmt.free();
    saveDB();
    const result = db.exec("SELECT * FROM records WHERE user_id = " + req.user.id + " ORDER BY id DESC LIMIT 1")[0];
    if (!result || !result.values[0]) {
      throw new Error('Insert failed');
    }
    const record = result.values[0];
    const cols = db.exec('PRAGMA table_info(records)')[0].values.map(v => v[1]);
    const recordObj = {};
    cols.forEach((col, i) => recordObj[col] = record[i]);
    saveDB();
    res.json(recordObj);
  } catch (e) {
    res.status(500).json({ error: '儲存失敗' });
  }
});

app.delete('/api/records/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('SELECT * FROM records WHERE id = ? AND user_id = ?');
    stmt.bind([id, req.user.id]);
    const row = stmt.getAsObject();
    stmt.free();
    if (!row) return res.status(404).json({ error: '找不到此紀錄' });
    db.run('DELETE FROM records WHERE id = ' + id);
    saveDB();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '刪除失敗' });
  }
});

app.delete('/api/records', authMiddleware, (req, res) => {
  try {
    db.run('DELETE FROM records WHERE user_id = ' + req.user.id);
    saveDB();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '清除失敗' });
  }
});

app.get('/api/csv/export', authMiddleware, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM records WHERE user_id = ? ORDER BY datetime(created_at) ASC');
    stmt.bind([req.user.id]);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    if (rows.length === 0) return res.status(400).json({ error: '目前沒有紀錄可以匯出' });
    const header = 'id,date,gender,height,weight,age,bmi,label,color,note';
    const csvRows = rows.map(r => {
      const note = '"' + (r.note || '').replace(/"/g, '""') + '"';
      return `${r.id},${r.date},${r.gender},${r.height},${r.weight},${r.age},${r.bmi},${r.label},${r.color},${note}`;
    });
    const csv = '\uFEFF' + header + '\n' + csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=BMI_${req.user.username}_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: '匯出失敗' });
  }
});

app.post('/api/csv/import', authMiddleware, (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText) return res.status(400).json({ error: '沒有提供 CSV 內容' });
    const lines = csvText.split(/\r\n|\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'CSV 檔案內容不足' });
    let count = 0;
    db.run('BEGIN TRANSACTION');
    for (let i = 1; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      if (parts.length < 10) continue;
      const bmi = parseFloat(parts[6]);
      if (isNaN(bmi) || bmi <= 0) continue;
      const stmt = db.prepare(
        'INSERT INTO records (user_id, date, gender, height, weight, age, bmi, label, color, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      stmt.bind([req.user.id, parts[1], parts[2], parseFloat(parts[3]), parseFloat(parts[4]), parseInt(parts[5]), bmi, parts[7], parts[8], parseCSVField(parts[9])]);
      stmt.step();
      stmt.free();
      count++;
    }
    db.run('COMMIT');
    // refresh insert count via last_insert_rowid not useful here, just count manually
    saveDB();
    res.json({ success: true, count });
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (e2) {}
    console.error(e);
    res.status(400).json({ error: '匯入失敗：' + e.message });
  }
});

app.delete('/api/user', authMiddleware, (req, res) => {
  try {
    db.run('DELETE FROM records WHERE user_id = ' + req.user.id);
    db.run('DELETE FROM sessions WHERE user_id = ' + req.user.id);
    db.run('DELETE FROM users WHERE id = ' + req.user.id);
    saveDB();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '刪除失敗' });
  }
});

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCSVField(field) {
  if (!field) return '無備註';
  if (field.startsWith('"') && field.endsWith('"')) {
    return field.slice(1, -1).replace(/""/g, '"');
  }
  return field;
}

setInterval(() => {
  try {
    db.run("DELETE FROM sessions WHERE expires_at <= datetime('now', 'localtime')");
    saveDB();
  } catch (e) {}
}, 60 * 60 * 1000);

(async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`BMI Tracker server running at http://localhost:${PORT}`);
    console.log(`SQLite database: ${DB_PATH}`);
  });
})();