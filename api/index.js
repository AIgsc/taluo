/**
 * 塔罗牌后端 API - Vercel Functions + Supabase
 */

const crypto = require('crypto');
const { Pool } = require('pg');

// ==================== 数据库连接池（全局复用） ====================
let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    console.log('数据库连接池已创建（首次）');
  }
  return pool;
}

// ==================== 自动建表（仅首次请求执行一次） ====================
let tablesCreated = false;
async function ensureTables() {
  if (tablesCreated) return;
  const db = getPool();
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS card_meanings (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      card_id INT NOT NULL,
      name VARCHAR(255) DEFAULT '',
      upright TEXT DEFAULT '',
      reversed TEXT DEFAULT '',
      pattern TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, card_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS taro_records (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      record_id VARCHAR(255) NOT NULL,
      timestamp BIGINT DEFAULT 0,
      rounds TEXT DEFAULT '[]',
      game_state TEXT DEFAULT '{}',
      current_round INT DEFAULT 0,
      full_deck TEXT DEFAULT '[]',
      cached_numbers TEXT DEFAULT '[]',
      re_sort_count INT DEFAULT 0,
      lock_picking INT DEFAULT 0,
      lock_current_main_delete INT DEFAULT 0,
      type VARCHAR(50) DEFAULT '',
      title VARCHAR(255) DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, record_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_progress (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      card_id INT NOT NULL,
      orientation VARCHAR(10) NOT NULL CHECK (orientation IN ('upright', 'reversed')),
      progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
      correct_count INT DEFAULT 0,
      error_count INT DEFAULT 0,
      last_time TIMESTAMPTZ DEFAULT NOW(),
      "interval" INT DEFAULT 1,
      ease_factor FLOAT DEFAULT 2.5,
      due_date TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, card_id, orientation)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_errors (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      card_id INT NOT NULL,
      orientation VARCHAR(10) NOT NULL CHECK (orientation IN ('upright', 'reversed')),
      error_count INT DEFAULT 0,
      last_error_time TIMESTAMPTZ DEFAULT NOW(),
      continuous_correct INT DEFAULT 0,
      timeout BOOLEAN DEFAULT FALSE,
      UNIQUE(user_id, card_id, orientation)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_exams (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      exam_time TIMESTAMPTZ DEFAULT NOW(),
      total INT NOT NULL,
      score INT NOT NULL,
      correct_rate FLOAT NOT NULL,
      duration INT NOT NULL,
      error_ids TEXT DEFAULT ''
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_exam_states (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      exam_state TEXT DEFAULT '{}'
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_confuse_errors (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL,
      pair_key VARCHAR(50) NOT NULL,
      error_count INT DEFAULT 0,
      UNIQUE(user_id, pair_key)
    )
  `);
  tablesCreated = true;
  console.log('数据库表初始化完成');
}

// SHA256 哈希
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// JWT 工具
function base64urlencode(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function createToken(payload, secret) {
  const header = base64urlencode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64urlencode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = base64urlencode(crypto.createHmac('sha256', secret).update(data).digest('base64'));
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const data = `${parts[0]}.${parts[1]}`;
    const expectedSig = base64urlencode(crypto.createHmac('sha256', secret).update(data).digest('base64'));
    if (parts[2] !== expectedSig) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64').toString());
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  const path = req.url.split('?')[0];
  console.log('请求:', req.method, path);
  
  try {
    const pool = getPool();
    await ensureTables();
    
    // ==================== 健康检查 ====================
    if (req.method === 'GET' && path === '/api/health') {
      return res.json({ status: 'ok', timestamp: Date.now(), version: 'V2-20260511-neon-userid' });
    }
    
    // ==================== 用户注册 ====================
    if (req.method === 'POST' && path === '/api/auth/register') {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
      }
      
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: '用户名已存在' });
      }
      
      const passwordHash = hashPassword(password);
      const result = await pool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
        [username, passwordHash]
      );
      
      const userId = result.rows[0].id;
      const token = createToken(
        { userId, username, exp: Math.floor(Date.now() / 1000) + 315360000 },
        process.env.JWT_SECRET
      );
      
      return res.json({ token, userId, username });
    }
    
    // ==================== 用户登录 ====================
    if (req.method === 'POST' && path === '/api/auth/login') {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
      }
      
      const result = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      
      const user = result.rows[0];
      if (user.password_hash !== hashPassword(password)) {
        return res.status(401).json({ error: '用户名或密码错误' });
      }
      
      const token = createToken(
        { userId: user.id, username, exp: Math.floor(Date.now() / 1000) + 315360000 },
        process.env.JWT_SECRET
      );
      
      return res.json({ token, userId: user.id, username });
    }
    
    // ==================== 验证用户身份 ====================
    const authHeader = req.headers.authorization;
    let userPayload = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      userPayload = verifyToken(token, process.env.JWT_SECRET);
    }
    
    if (!userPayload) {
      return res.status(401).json({ error: '未登录' });
    }
    
    if (!userPayload.userId) {
      return res.status(500).json({ error: '用户身份异常，请退出重新登录后重试' });
    }
    
    // ==================== 获取历史记录 ====================
    if (req.method === 'GET' && path === '/api/records') {
      const result = await pool.query(
        'SELECT record_id, created_at, timestamp, rounds, game_state, current_round, full_deck, cached_numbers, re_sort_count, lock_picking, lock_current_main_delete, type, title FROM taro_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000',
        [userPayload.userId]
      );
      
      const history = result.rows.map(row => ({
        id: row.record_id,
        timestamp: Number(row.timestamp),
        rounds: JSON.parse(row.rounds),
        gameState: JSON.parse(row.game_state),
        currentRound: row.current_round,
        fullDeck: JSON.parse(row.full_deck),
        cachedNumbers: JSON.parse(row.cached_numbers),
        reSortCount: row.re_sort_count,
        lockPicking: !!row.lock_picking,
        lockCurrentMainDelete: !!row.lock_current_main_delete,
        type: row.type,
        title: row.title
      }));
      
      return res.json(history);
    }
    
    // ==================== 保存记录 ====================
    if (req.method === 'POST' && path === '/api/records') {
      const record = req.body;
      
      const existing = await pool.query(
        'SELECT id FROM taro_records WHERE user_id = $1 AND record_id = $2',
        [userPayload.userId, record.id]
      );
      
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE taro_records SET timestamp = $1, rounds = $2, game_state = $3, current_round = $4,
           full_deck = $5, cached_numbers = $6, re_sort_count = $7, lock_picking = $8,
           lock_current_main_delete = $9, type = $10, title = $11
           WHERE user_id = $12 AND record_id = $13`,
          [
            record.timestamp, JSON.stringify(record.rounds), JSON.stringify(record.gameState),
            record.currentRound, JSON.stringify(record.fullDeck), JSON.stringify(record.cachedNumbers),
            record.reSortCount, record.lockPicking ? 1 : 0, record.lockCurrentMainDelete ? 1 : 0,
            record.type, record.title, userPayload.userId, record.id
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO taro_records (user_id, record_id, timestamp, rounds, game_state, current_round,
           full_deck, cached_numbers, re_sort_count, lock_picking, lock_current_main_delete, type, title)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            userPayload.userId, record.id, record.timestamp, JSON.stringify(record.rounds),
            JSON.stringify(record.gameState), record.currentRound, JSON.stringify(record.fullDeck),
            JSON.stringify(record.cachedNumbers), record.reSortCount, record.lockPicking ? 1 : 0,
            record.lockCurrentMainDelete ? 1 : 0, record.type, record.title
          ]
        );
        
        // 清理旧记录
        const countResult = await pool.query(
          'SELECT id FROM taro_records WHERE user_id = $1 ORDER BY created_at DESC',
          [userPayload.userId]
        );
        if (countResult.rows.length > 1000) {
          const deleteIds = countResult.rows.slice(1000).map(r => r.id);
          const placeholders = deleteIds.map((_, i) => `$${i + 1}`).join(',');
          await pool.query(`DELETE FROM taro_records WHERE id IN (${placeholders})`, deleteIds);
        }
      }
      
      return res.json({ success: true });
    }
    
    // ==================== 更新记录标题 ====================
    if (req.method === 'PUT' && path.startsWith('/api/records/')) {
      const recordId = path.split('/api/records/')[1];
      const { title } = req.body;
      
      await pool.query(
        'UPDATE taro_records SET title = $1 WHERE user_id = $2 AND record_id = $3',
        [title, userPayload.userId, recordId]
      );
      
      return res.json({ success: true });
    }
    
    // ==================== 删除记录 ====================
    if (req.method === 'DELETE' && path.startsWith('/api/records/')) {
      const recordId = path.split('/api/records/')[1];
      
      await pool.query(
        'DELETE FROM taro_records WHERE user_id = $1 AND record_id = $2',
        [userPayload.userId, recordId]
      );
      
      return res.json({ success: true });
    }
    
    // ==================== 获取牌义（按用户） ====================
    if (req.method === 'GET' && path === '/api/card-meanings') {
      const result = await pool.query(
        'SELECT card_id, name, upright, reversed, pattern, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at FROM card_meanings WHERE user_id = $1 ORDER BY card_id ASC',
        [userPayload.userId]
      );
      
      const meanings = {};
      result.rows.forEach(row => {
        meanings[row.card_id] = {
          name: row.name,
          upright: row.upright,
          reversed: row.reversed,
          pattern: row.pattern,
          updated_at: row.updated_at ? Number(row.updated_at) : 0
        };
      });
      
      return res.json(meanings);
    }
    
    // ==================== 初始化牌义到当前用户 ====================
    if (req.method === 'POST' && path === '/api/card-meanings/seed') {
      const { cards } = req.body;
      
      if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: '牌义数据不能为空' });
      }
      
      // 使用事务保护：DELETE + 循环 INSERT 要么全部成功，要么全部回滚
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        await client.query('DELETE FROM card_meanings WHERE user_id = $1', [userPayload.userId]);
        
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          if (card && card.name) {
            await client.query(
              'INSERT INTO card_meanings (user_id, card_id, name, upright, reversed, pattern, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
              [userPayload.userId, i + 1, card.name, card.upright || '', card.reversed || '', card.pattern || '']
            );
          }
        }
        
        await client.query('COMMIT');
        return res.json({ success: true, count: cards.length });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    
    // ==================== 更新单张牌义（按用户） ====================
    if (req.method === 'PUT' && path.startsWith('/api/card-meanings/')) {
      const cardId = parseInt(path.split('/api/card-meanings/')[1]);
      
      if (isNaN(cardId) || cardId < 1 || cardId > 78) {
        return res.status(400).json({ error: '无效的牌ID' });
      }
      
      const { name, upright, reversed, pattern } = req.body;
      
      const existing = await pool.query(
        'SELECT card_id FROM card_meanings WHERE user_id = $1 AND card_id = $2',
        [userPayload.userId, cardId]
      );
      
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE card_meanings SET name = $1, upright = $2, reversed = $3, pattern = $4, updated_at = NOW() WHERE user_id = $5 AND card_id = $6',
          [name || '', upright || '', reversed || '', pattern || '', userPayload.userId, cardId]
        );
      } else {
        await pool.query(
          'INSERT INTO card_meanings (user_id, card_id, name, upright, reversed, pattern, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
          [userPayload.userId, cardId, name || '', upright || '', reversed || '', pattern || '']
        );
      }
      
      // 返回服务器当前的 updated_at 时间戳
      const updated = await pool.query(
        'SELECT EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at FROM card_meanings WHERE user_id = $1 AND card_id = $2',
        [userPayload.userId, cardId]
      );
      const serverTimestamp = updated.rows[0]?.updated_at ? Number(updated.rows[0].updated_at) : Date.now();
      
      return res.json({ success: true, updated_at: serverTimestamp });
    }
    

    
    // ==================== 训练系统：获取进度 ====================
    if (req.method === 'GET' && path === '/api/training/progress') {
      const result = await pool.query(
        'SELECT card_id, orientation, progress, correct_count, error_count, "interval", ease_factor, EXTRACT(EPOCH FROM due_date)::bigint * 1000 as due_date FROM user_progress WHERE user_id = $1 ORDER BY card_id, orientation',
        [userPayload.userId]
      );
      return res.json(result.rows);
    }
    
    // ==================== 训练系统：更新进度 ====================
    if (req.method === 'POST' && path === '/api/training/progress') {
      const { card_id, orientation, is_correct, interval, ease_factor, due_date, progress, correct_count, error_count } = req.body;
      
      if (!card_id || !orientation) {
        return res.status(400).json({ error: '缺少必要参数' });
      }
      
      // 校验参数合法性
      if (!['upright', 'reversed'].includes(orientation)) {
        return res.status(400).json({ error: 'orientation 参数不合法' });
      }
      
      // 使用前端传递的progress值（已含答对+10/答错-15），如果没有则用服务端计算
      let newProgress = progress;
      if (newProgress === undefined) {
        const curr = await pool.query(
          'SELECT progress FROM user_progress WHERE user_id = $1 AND card_id = $2 AND orientation = $3',
          [userPayload.userId, card_id, orientation]
        );
        const oldProgress = curr.rows[0]?.progress || 0;
        newProgress = is_correct ? Math.min(100, oldProgress + 10) : Math.max(0, oldProgress - 15);
      }
      
      const newInterval = interval !== undefined ? interval : 1;
      const newEaseFactor = ease_factor !== undefined ? ease_factor : 2.5;
      // 确保 due_date 是合法数值
      const dueDateMs = (typeof due_date === 'number' && !isNaN(due_date)) ? due_date : Date.now();
      const newDueDate = new Date(dueDateMs);
      const newCorrectCount = correct_count !== undefined ? correct_count : 0;
      const newErrorCount = error_count !== undefined ? error_count : 0;
      
      await pool.query(
        `INSERT INTO user_progress (user_id, card_id, orientation, progress, correct_count, error_count, last_time, "interval", ease_factor, due_date)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9)
         ON CONFLICT (user_id, card_id, orientation) DO UPDATE SET
           progress=$4, correct_count=$5, error_count=$6, last_time=NOW(),
           "interval"=$7, ease_factor=$8, due_date=$9`,
        [userPayload.userId, card_id, orientation,
         newProgress,
         newCorrectCount, newErrorCount,
         newInterval, newEaseFactor, newDueDate]
      );
      
      return res.json({ progress: newProgress, correct_count: newCorrectCount, error_count: newErrorCount, interval: newInterval, ease_factor: newEaseFactor, due_date: newDueDate.toISOString() });
    }
    
    // ==================== 训练系统：删除进度 ====================
    if (req.method === 'DELETE' && path === '/api/training/progress') {
      await pool.query('DELETE FROM user_progress WHERE user_id = $1', [userPayload.userId]);
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：获取错题 ====================
    if (req.method === 'GET' && path === '/api/training/errors') {
      const result = await pool.query(
        'SELECT card_id, orientation, error_count, continuous_correct, timeout FROM user_errors WHERE user_id = $1 ORDER BY error_count DESC',
        [userPayload.userId]
      );
      return res.json(result.rows);
    }
    
    // ==================== 训练系统：记录错题 ====================
    if (req.method === 'POST' && path === '/api/training/errors') {
      const { card_id, orientation, is_correct, error_count, continuous_correct, timeout } = req.body;
      
      if (!card_id || !orientation) {
        return res.status(400).json({ error: '缺少必要参数' });
      }
      
      const newEc = error_count !== undefined ? error_count : (is_correct ? 0 : 1);
      const newCc = continuous_correct !== undefined ? continuous_correct : (is_correct ? 1 : 0);
      const newTimeout = timeout !== undefined ? !!timeout : false;
      
      // 连续答对5次 → 已掌握，自动删除错题记录
      if (newCc >= 5) {
        await pool.query(
          'DELETE FROM user_errors WHERE user_id = $1 AND card_id = $2 AND orientation = $3',
          [userPayload.userId, card_id, orientation]
        );
        return res.json({ success: true, deleted: true });
      }
      
      await pool.query(
        `INSERT INTO user_errors (user_id, card_id, orientation, error_count, continuous_correct, last_error_time, timeout)
         VALUES ($1,$2,$3,$4,$5,NOW(),$6)
         ON CONFLICT (user_id, card_id, orientation) DO UPDATE SET
           error_count=$4, continuous_correct=$5, last_error_time=NOW(), timeout=$6`,
        [userPayload.userId, card_id, orientation, newEc, newCc, newTimeout]
      );
      
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：清除错题 ====================
    if (req.method === 'DELETE' && (path === '/api/training/errors' || path.startsWith('/api/training/errors/'))) {
      // 尝试从 URL 参数获取（兼容前端的 /api/training/errors/cardId/orientation）
      let card_id, orientation;
      if (path.startsWith('/api/training/errors/')) {
        const parts = path.split('/');
        if (parts.length >= 6) {
          card_id = Number(parts[4]);
          orientation = parts[5];
        }
      }
      // 如果 URL 没有参数，从 body 获取
      if (!card_id || !orientation) {
        card_id = req.body?.card_id;
        orientation = req.body?.orientation;
      }
      
      if (card_id && orientation) {
        await pool.query(
          'DELETE FROM user_errors WHERE user_id = $1 AND card_id = $2 AND orientation = $3',
          [userPayload.userId, card_id, orientation]
        );
      } else {
        await pool.query('DELETE FROM user_errors WHERE user_id = $1', [userPayload.userId]);
      }
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：混淆错误记录 ====================
    if (req.method === 'GET' && path === '/api/training/confuse-errors') {
      const result = await pool.query(
        'SELECT pair_key, error_count FROM user_confuse_errors WHERE user_id = $1',
        [userPayload.userId]
      );
      return res.json(result.rows);
    }
    
    if (req.method === 'POST' && path === '/api/training/confuse-errors') {
      const { pair_key, error_count } = req.body;
      if (!pair_key) return res.status(400).json({ error: '缺少 pair_key' });
      
      await pool.query(
        `INSERT INTO user_confuse_errors (user_id, pair_key, error_count) 
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, pair_key) 
         DO UPDATE SET error_count = $3`,
        [userPayload.userId, pair_key, error_count || 0]
      );
      return res.json({ success: true });
    }
    
    if (req.method === 'DELETE' && path === '/api/training/confuse-errors') {
      await pool.query('DELETE FROM user_confuse_errors WHERE user_id = $1', [userPayload.userId]);
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：获取考试记录 ====================
    if (req.method === 'GET' && path === '/api/training/exams') {
      const result = await pool.query(
        'SELECT id, exam_time, total, score, correct_rate, duration, error_ids FROM user_exams WHERE user_id = $1 ORDER BY exam_time DESC LIMIT 200',
        [userPayload.userId]
      );
      return res.json(result.rows);
    }
    
    // ==================== 训练系统：保存考试记录 ====================
    if (req.method === 'POST' && path === '/api/training/exams') {
      const { total, score, correct_rate, duration, error_ids } = req.body;
      
      await pool.query(
        `INSERT INTO user_exams (user_id, exam_time, total, score, correct_rate, duration, error_ids)
         VALUES ($1, NOW(), $2, $3, $4, $5, $6)`,
        [userPayload.userId, total, score, correct_rate, duration, error_ids || '']
      );
      
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：删除考试记录 ====================
    if (req.method === 'DELETE' && path === '/api/training/exams') {
      await pool.query('DELETE FROM user_exams WHERE user_id = $1', [userPayload.userId]);
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：获取考试状态 ====================
    if (req.method === 'GET' && path === '/api/training/exam-state') {
      const result = await pool.query(
        'SELECT exam_state FROM user_exam_states WHERE user_id = $1',
        [userPayload.userId]
      );
      if (result.rows.length > 0) {
        return res.json({ exam_state: result.rows[0].exam_state });
      } else {
        return res.json({ exam_state: '{}' });
      }
    }
    
    // ==================== 训练系统：保存考试状态 ====================
    if (req.method === 'POST' && path === '/api/training/exam-state') {
      const { exam_state } = req.body;
      
      const existing = await pool.query(
        'SELECT id FROM user_exam_states WHERE user_id = $1',
        [userPayload.userId]
      );
      
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE user_exam_states SET exam_state = $1 WHERE user_id = $2',
          [exam_state || '{}', userPayload.userId]
        );
      } else {
        await pool.query(
          'INSERT INTO user_exam_states (user_id, exam_state) VALUES ($1, $2)',
          [userPayload.userId, exam_state || '{}']
        );
      }
      
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：增量答题同步（轻量） ====================
    if (req.method === 'POST' && path === '/api/training/exam-state/answer') {
      const { currentIndex, answer } = req.body;
      
      if (!answer) {
        return res.json({ success: false, error: '缺少答案数据' });
      }
      
      // 读取现有考试状态
      const existing = await pool.query(
        'SELECT exam_state FROM user_exam_states WHERE user_id = $1',
        [userPayload.userId]
      );
      
      let state = { questions: [], answers: [], currentIndex: 0 };
      if (existing.rows.length > 0 && existing.rows[0].exam_state && existing.rows[0].exam_state !== '{}') {
        try {
          state = JSON.parse(existing.rows[0].exam_state);
        } catch (e) {
          state = { questions: [], answers: [], currentIndex: 0 };
        }
      }
      
      // 追加答案（防止重复：同一 cardId+orientation 只保留最后一次）
      if (!state.answers) state.answers = [];
      const dupIdx = state.answers.findIndex(a => a.cardId === answer.cardId && a.orientation === answer.orientation);
      if (dupIdx >= 0) {
        state.answers[dupIdx] = answer; // 覆盖旧答案，不重复累积
      } else {
        state.answers.push(answer);
      }
      if (currentIndex !== undefined) state.currentIndex = currentIndex;
      
      const stateJson = JSON.stringify(state);
      
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE user_exam_states SET exam_state = $1 WHERE user_id = $2',
          [stateJson, userPayload.userId]
        );
      } else {
        await pool.query(
          'INSERT INTO user_exam_states (user_id, exam_state) VALUES ($1, $2)',
          [userPayload.userId, stateJson]
        );
      }
      
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：清除考试状态 ====================
    if (req.method === 'DELETE' && path === '/api/training/exam-state') {
      await pool.query('DELETE FROM user_exam_states WHERE user_id = $1', [userPayload.userId]);
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：获取配置数据 ====================
    if (req.method === 'GET' && path === '/api/training/config') {
      const config = {
        // 卡牌名称（78张，索引=cardId）
        tarotNames: [
          "", "愚人","魔术师","女祭司","女皇","皇帝","教皇","恋人","战车","力量","隐者",
          "命运之轮","正义","倒吊人","死神","节制","恶魔","高塔","星星","月亮","太阳","审判","世界",
          "宝剑一","宝剑二","宝剑三","宝剑四","宝剑五","宝剑六","宝剑七","宝剑八","宝剑九","宝剑十",
          "宝剑侍从","宝剑骑士","宝剑女王","宝剑国王",
          "星币一","星币二","星币三","星币四","星币五","星币六","星币七","星币八","星币九","星币十",
          "星币侍从","星币骑士","星币女王","星币国王",
          "权杖一","权杖二","权杖三","权杖四","权杖五","权杖六","权杖七","权杖八","权杖九","权杖十",
          "权杖侍从","权杖骑士","权杖女王","权杖国王",
          "圣杯一","圣杯二","圣杯三","圣杯四","圣杯五","圣杯六","圣杯七","圣杯八","圣杯九","圣杯十",
          "圣杯侍从","圣杯骑士","圣杯女王","圣杯国王"
        ],
        
        // 相似牌对
        confusePairs: [
          [2, 36],    // 魔术师 ↔ 宝剑国王
          [52, 38],   // 权杖二 ↔ 星币二
          [25, 69],   // 宝剑三 ↔ 圣杯五
          [8, 57],    // 战车 ↔ 权杖七
          [1, 51],    // 愚人 ↔ 权杖一
          [3, 77],    // 女祭司 ↔ 圣杯女王
          [32, 14],   // 宝剑十 ↔ 死神
          [18, 19],    // 星星 ↔ 月亮
          [15, 66],   // 节制 ↔ 圣杯二
          [47, 61],   // 星币侍从 ↔ 权杖侍从
          [34, 62],   // 宝剑骑士 ↔ 权杖骑士
          [6, 46]     // 教皇 ↔ 星币十
        ],
        
        // 推导题数据结构
        deductionData: {
          // 四个牌组
          suits: {
            wands: { name: '权杖', element: '火', elementName: '行动', story: '🔥 权杖（火=行动）<br>1-2 主动邀约相亲，果断做出选择<br>3-4 频繁见面推进，用行动稳住关系<br>5-6 争执产生矛盾，及时调整相处模式<br>7-8 冷静反思，全力行动化解问题<br>9-10 怕错过彼此，用心维系，修成正果' },
            cups: { name: '圣杯', element: '水', elementName: '沟通', story: '💧🍸 圣杯（水=沟通）<br>1-2 相亲开启聊天，挑选相处合拍的人<br>3-4 日常分享升温，言语互动稳固感情<br>5-6 沟通出现矛盾、陷入冷战，主动破冰调整<br>7-8 静下心反思，用心交流解开隔阂<br>9-10 怕失去对方，敞开心扉，感情圆满' },
            pentacles: { name: '星币', element: '土', elementName: '规划', story: '⭐️ 星币（土=规划）<br>1-2 着手规划相亲，按条件筛选人选<br>3-4 依照计划约会发展，稳步走到见家长<br>5-6 因现实问题起分歧，重新规划收支与安排<br>7-8 思索未来走向，踏实努力解决难题<br>9-10 不愿错过良缘，共同打拼，敲定婚嫁规划' },
            swords: { name: '宝剑', element: '风', elementName: '想法', story: '⚔️ 宝剑（风=想法）<br>1-2 萌生相亲想法，纠结该选择谁<br>3-4 梳理思绪推进关系，理性评估稳住状态<br>5-6 观念不合引发争执，及时调整心态<br>7-8 反复思索复盘，理性分析化解矛盾<br>9-10 怕错过良缘，彻底想通，认定彼此' }
          },
          
          // 十个阶段
          stages: {
            1: { name: '开始', desc: '开始阶段，新的起点' },
            2: { name: '选择', desc: '选择阶段，做决定' },
            3: { name: '发展', desc: '发展阶段，向前推进' },
            4: { name: '稳定', desc: '稳定阶段，保持现状' },
            5: { name: '冲突', desc: '冲突阶段，出现矛盾' },
            6: { name: '调整', desc: '调整阶段，解决问题' },
            7: { name: '反思', desc: '反思阶段，思考总结' },
            8: { name: '力量', desc: '力量阶段，积蓄能量' },
            9: { name: '遗憾', desc: '遗憾阶段，有所不足' },
            10: { name: '完成', desc: '完成阶段，达成目标' }
          },
          
          // 宫廷牌级别
          court: {
            page: { name: '侍从', level: 1, desc: '学习/探索，初级，还在学，好奇心，不成熟' },
            knight: { name: '骑士', level: 3, desc: '行动/冲刺，中级，主动推进，有冲劲但可能不稳' },
            queen: { name: '女王', level: 5, desc: '掌控/内在，高级偏内，有掌控力，成熟但偏感性/细腻' },
            king: { name: '国王', level: 10, desc: '掌控/外在，高级偏外，有掌控力，成熟但偏理性/权威' }
          },
          
          // 牌组→卡牌ID映射（小阿卡纳）
          suitCards: {
            wands: [51,52,53,54,55,56,57,58,59,60,61,62,63,64],
            cups: [65,66,67,68,69,70,71,72,73,74,75,76,77,78],
            pentacles: [37,38,39,40,41,42,43,44,45,46,47,48,49,50],
            swords: [23,24,25,26,27,28,29,30,31,32,33,34,35,36]
          },
          
          // 具体每张牌的推导含义
          cardDeductions: {
            1: { stage: 'origin', element: 'all', elementName: '四元素', upright: '新开始', reversed: '不听建议、开始不顺利' },
            2: { stage: 1, element: 'fire', elementName: '行动', upright: '有资源', reversed: '没资源、沟通受阻有隐瞒' },
            3: { stage: 2, element: 'water', elementName: '沟通', upright: '静观其变', reversed: '情绪化、识人不清' },
            4: { stage: 3, element: 'earth', elementName: '规划', upright: '踏实认真', reversed: '不踏实、无规划自私' },
            5: { stage: 4, element: 'fire', elementName: '行动', upright: '靠谱坚定', reversed: '不靠谱、大男子主义' },
            6: { stage: 5, element: 'earth', elementName: '规划', upright: '有人听从', reversed: '无人听从、第三方干扰' },
            7: { stage: 6, element: 'air', elementName: '想法', upright: '平衡稳定', reversed: '失衡、三方关系' },
            8: { stage: 7, element: 'water', elementName: '沟通', upright: '可控', reversed: '失控、失去主动权' },
            9: { stage: 8, element: 'fire', elementName: '行动', upright: '温柔控制', reversed: '难控制、无能力' },
            10: { stage: 9, element: 'earth', elementName: '规划', upright: '迷茫', reversed: '更迷茫、极度迷茫' },
            11: { stage: 10, element: 'water', elementName: '沟通', upright: '运势变动', reversed: '运势低迷、受外界影响' },
            12: { stage: 1, element: 'air', elementName: '想法', level: 'high', upright: '平衡规则', reversed: '失衡、关系不对等' },
            13: { stage: 2, element: 'water', elementName: '沟通', level: 'high', upright: '精神共鸣', reversed: '精神压力大、相处不适' },
            14: { stage: 3, element: 'earth', elementName: '规划', level: 'high', upright: '结束新生', reversed: '未结束、反复纠缠' },
            15: { stage: 4, element: 'fire', elementName: '行动', level: 'high', upright: '平衡自律', reversed: '沟通阻碍、沟通不畅' },
            16: { stage: 5, element: 'earth', elementName: '规划', level: 'high', upright: '长期欲望', reversed: '短期欲望、短暂纠葛' },
            17: { stage: 6, element: 'fire', elementName: '行动', level: 'high', upright: '突发变故', reversed: '已知变故、问题暴露' },
            18: { stage: 7, element: 'air', elementName: '想法', level: 'high', upright: '有期望', reversed: '没期望、消极无信心' },
            19: { stage: 8, element: 'water', elementName: '沟通', level: 'high', upright: '隐藏看不清', reversed: '看清真相、发现问题' },
            20: { stage: 9, element: 'fire', elementName: '行动', level: 'high', upright: '积极阳光', reversed: '不明朗、有第三方' },
            21: { stage: 10, element: 'water', elementName: '沟通', level: 'high', upright: '抉择', reversed: '问题反复、自欺欺人' },
            22: { stage: 'complete', element: 'all', elementName: '四元素', upright: '克服大环境问题', reversed: '很难克服' },
            
            51: { stage: 1, upright: '主动去做，开启新行动', reversed: '不主动出击，没兴趣放下了' },
            52: { stage: 2, upright: '先观望，不急着出手', reversed: '迟迟不决、错过时机 / 盲目行动、不加思考' },
            53: { stage: 3, upright: '迈步出发，主动推进', reversed: '行动受阻、进展缓慢 / 冲得太快、后劲不足' },
            54: { stage: 4, upright: '局势稳定，值得庆祝', reversed: '庆祝过早、乐极生悲 / 局势不稳、难以为继' },
            55: { stage: 5, upright: '行动分歧，发生争执冲突', reversed: '避免冲突、息事宁人 / 冲突升级、彻底决裂' },
            56: { stage: 6, upright: '调整节奏后取胜，重掌局面', reversed: '调整失败、重掌失败 / 成功太早、难以守住' },
            57: { stage: 7, upright: '迎难而上，咬牙克服阻碍', reversed: '放弃退缩、不敢面对 / 冲得太猛、元气大伤' },
            58: { stage: 8, upright: '飞速推进，节奏停不下来', reversed: '速度过快、失控翻车 / 速度太慢、停滞不前' },
            59: { stage: 9, upright: '谨慎防守，规避再次受挫', reversed: '过度防御、闭关自守 / 放松警惕、再次受挫' },
            60: { stage: 10, upright: '负重坚持，最终完成目标', reversed: '不堪重负、放弃目标 / 完成质量差、结果糟糕' },
            61: { court: 'page', upright: '心生好奇，愿意尝试新行动', reversed: '三分钟热度、虎头蛇尾 / 完全没兴趣、不愿尝试' },
            62: { court: 'knight', upright: '积极追逐，主动出击', reversed: '冲动莽撞、不计后果 / 不够积极、被动等待' },
            63: { court: 'queen', upright: '有主见、负责任、行事直率', reversed: '霸道专制、控制欲强 / 没主见、不负责任' },
            64: { court: 'king', upright: '专一负责，行事果断、言出必行', reversed: '言而无信、不负责任 / 刚愎自用、独断专行' },
            
            65: { stage: 1, upright: '萌生好感，相处融洽投缘', reversed: '感情冷淡、缺乏感觉 / 好感过度、热情过剩' },
            66: { stage: 2, upright: '双向平等，相处合作愉快', reversed: '沟通不畅、关系失衡 / 一方讨好、不平等' },
            67: { stage: 3, upright: '欢聚热闹，社交氛围轻松', reversed: '社交失败、孤独失落 / 过度社交、精力耗尽' },
            68: { stage: 4, upright: '心态冷淡，对现状提不起兴致', reversed: '重新燃起希望、热情回来 / 更加冷淡、心死' },
            69: { stage: 5, upright: '内心失落，情绪难过伤感', reversed: '走出悲伤、情绪好转 / 悲伤加剧、痛苦升级' },
            70: { stage: 6, upright: '主动关怀，温柔给予温暖', reversed: '自私冷漠、只关心自己 / 过度付出、感到委屈' },
            71: { stage: 7, upright: '空想幻想，不切实际、画大饼', reversed: '回归现实、停止幻想 / 幻想破灭、彻底失望' },
            72: { stage: 8, upright: '攒够失望，主动抽身离开', reversed: '犹豫不决、难以离开 / 离开太急、后悔莫及' },
            73: { stage: 9, upright: '表面自得圆满，内心孤独缺憾', reversed: '感到满足、内心充实 / 不满加剧、难以自欺' },
            74: { stage: 10, upright: '情感和睦，关系圆满幸福', reversed: '关系破裂、家庭不睦 / 表面和谐、内在矛盾' },
            75: { court: 'page', upright: '主动示好，聊得开心', reversed: '敏感脆弱、容易受伤 / 示好过度、惹人厌烦' },
            76: { court: 'knight', upright: '在意对方，会哄人，给情绪价值', reversed: '情绪化、喜怒无常 / 不在意对方、冷漠敷衍' },
            77: { court: 'queen', upright: '对感情要求高、内心不满意但不说', reversed: '情绪失控、歇斯底里 / 毫无要求、过度纵容' },
            78: { court: 'king', upright: '浪漫体贴，完美情人', reversed: '花心滥情、不负责任 / 不懂浪漫、过于理性' },
            
            37: { stage: 1, upright: '确立现实目标，开启全新规划', reversed: '目标模糊、规划混乱、错失良机' },
            38: { stage: 2, upright: '权衡利弊，对比取舍、考量得失', reversed: '失衡混乱、决策错误、难以下手' },
            39: { stage: 3, upright: '交流探讨，协作学习、推进落地', reversed: '合作失败、学习停滞、难以落地' },
            40: { stage: 4, upright: '固守现状，谨慎保守、不愿改变', reversed: '财务不稳、状态动荡、被迫改变' },
            41: { stage: 5, upright: '现实受阻，事情进展缓慢卡顿', reversed: '走出困境、逐步好转 / 阻碍更大、彻底停滞' },
            42: { stage: 6, upright: '平衡付出与收获，维持状态稳定', reversed: '付出不均、失去平衡、利益冲突' },
            43: { stage: 7, upright: '犹豫观望，纠结投入是否值得', reversed: '果断投入、不再纠结 / 彻底放弃、不再观望' },
            44: { stage: 8, upright: '踏实专注，埋头深耕、认真做事', reversed: '分心偷懒、半途而废 / 过度辛苦、难以承受' },
            45: { stage: 9, upright: '安于享乐，忽视长远、忽略他人', reversed: '挥霍过度、财务危机 / 开始反思、重视长远' },
            46: { stage: 10, upright: '同心协力，生活安稳、家业红火', reversed: '家业衰败、离心离德 / 稳定过头、缺乏活力' },
            47: { court: 'page', upright: '有初步想法，慢慢来', reversed: '想法不切实际、缺乏行动力 / 放弃规划、听天由命' },
            48: { court: 'knight', upright: '稳重专一，考虑实际', reversed: '固执死板、不懂变通 / 不够稳重、浮躁冒进' },
            49: { court: 'queen', upright: '踏实肯干，但不主动说', reversed: '吝啬小气、斤斤计较 / 过度付出、不懂表达' },
            50: { court: 'king', upright: '顾家靠谱，说到做到', reversed: '不守承诺、不负责任 / 过于死板、缺乏情趣' },
            
            23: { stage: 1, upright: '思路清晰，想法统一、达成共识', reversed: '想法不一致' },
            24: { stage: 2, upright: '思绪纠结，左右为难、难以抉择', reversed: '决策仓促、选错方向、纠结逃避' },
            25: { stage: 3, upright: '心生刺痛，思绪内耗、倍感难受', reversed: '走出伤痛、停止内耗 / 痛苦加剧、内耗升级' },
            26: { stage: 4, upright: '暂停思绪，静心沉淀、冷静休整', reversed: '打破平静、无法休息、焦虑不安' },
            27: { stage: 5, upright: '观念不合，产生分歧、言语争执', reversed: '避免冲突、忍让妥协 / 争执升级、决裂分离' },
            28: { stage: 6, upright: '逐步调整心态，慢慢向好发展', reversed: '调整失败、心态恶化 / 快速调整、进展不顺' },
            29: { stage: 7, upright: '心存侥幸，投机取巧、暗藏心思', reversed: '坦诚面对、不再投机 / 被发现、谎言揭穿' },
            30: { stage: 8, upright: '思维受限，自我束缚、难以挣脱', reversed: '打破束缚、重获自由 / 束缚更紧、更难行动' },
            31: { stage: 9, upright: '思虑过重，胡思乱想、焦虑内耗', reversed: '放下焦虑、心态平静 / 焦虑加剧、精神崩溃' },
            32: { stage: 10, upright: '负面状态落幕，彻底结束、清零重启', reversed: '无法结束、反复纠缠 / 结束太快、措手不及' },
            33: { court: 'page', upright: '心不定，到处张望', reversed: '思绪混乱、心浮气躁 / 心死了、不再关心' },
            34: { court: 'knight', upright: '目标明确，主动推进', reversed: '目标混乱、行动受阻 / 冲动冒进、不顾后果' },
            35: { court: 'queen', upright: '有原则，说话直，不给面子', reversed: '失去原则、阿谀奉承 / 刻薄无情、伤人太深' },
            36: { court: 'king', upright: '有担当，说到做到，理性决断', reversed: '逃避责任、言而无信 / 独断专行、滥用权威' }
          }
        },
        
        // 训练兜底关键词
        trainFallback: [
          { id:1, uk:"新开始", ud:"新计划忽视风险", rk:"不听建议", rd:"开始不顺利" },
          { id:2, uk:"有资源", ud:"善于沟通", rk:"没资源", rd:"沟通受阻有隐瞒" },
          { id:3, uk:"静观其变", ud:"理智冷静", rk:"有情绪", rd:"识人不清" },
          { id:4, uk:"踏实认真", ud:"负责成熟", rk:"不踏实", rd:"无规划自私" },
          { id:5, uk:"靠谱坚定", ud:"稳重有规划", rk:"不靠谱", rd:"大男子主义" },
          { id:6, uk:"有人听从", ud:"沟通顺畅", rk:"无人听从", rd:"第三方干扰" },
          { id:7, uk:"平衡稳定", ud:"双向奔赴", rk:"失衡", rd:"三方关系" },
          { id:8, uk:"可控", ud:"主导解决问题", rk:"失控", rd:"失去主动权" },
          { id:9, uk:"温柔控制", ud:"智慧掌控", rk:"难控制", rd:"无能力" },
          { id:10, uk:"迷茫", ud:"寻找方向", rk:"更迷茫", rd:"极度迷茫" },
          { id:11, uk:"运势变动", ud:"自然起伏", rk:"运势低迷", rd:"受外界影响" },
          { id:12, uk:"平衡规则", ud:"平等讲原则", rk:"失衡", rd:"关系不对等" },
          { id:13, uk:"精神共鸣", ud:"在乎同频", rk:"精神压力", rd:"相处不适" },
          { id:14, uk:"结束新生", ud:"新旧交替", rk:"未结束", rd:"反复纠缠" },
          { id:15, uk:"平衡自律", ud:"自律平衡", rk:"沟通阻碍", rd:"沟通不畅" },
          { id:16, uk:"长期欲望", ud:"三方关系", rk:"短期欲望", rd:"短暂纠葛" },
          { id:17, uk:"突发变故", ud:"不可抗力", rk:"已知变故", rd:"问题暴露" },
          { id:18, uk:"有期望", ud:"信心满满", rk:"没期望", rd:"消极无信心" },
          { id:19, uk:"隐藏看不清", ud:"有隐患", rk:"看清真相", rd:"发现问题" },
          { id:20, uk:"积极阳光", ud:"相处快乐", rk:"不明朗", rd:"有第三方" },
          { id:21, uk:"抉择", ud:"适合做决定", rk:"问题反复", rd:"自欺欺人" },
          { id:22, uk:"克服阻碍", ud:"结果完美", rk:"难克服", rd:"环境阻碍大" },
          { id:23, uk:"想法一致", ud:"主动规划", rk:"想法不一", rd:"规划冲突" },
          { id:24, uk:"选择纠结", ud:"自我蒙蔽", rk:"放下选择", rd:"放弃纠结" },
          { id:25, uk:"扎心不开心", ud:"情绪低落", rk:"更扎心", rd:"持续低落" },
          { id:26, uk:"停滞冷战", ud:"关系停滞", rk:"行动起来", rd:"需主动推进" },
          { id:27, uk:"争执冲突", ud:"吵架矛盾", rk:"退让", rd:"妥协有第三方" },
          { id:28, uk:"进展慢", ud:"发展缓慢", rk:"关系崩", rd:"矛盾破裂" },
          { id:29, uk:"隐藏问题", ud:"侥幸心理", rk:"问题暴露", rd:"隐瞒被发现" },
          { id:30, uk:"束缚难行动", ud:"自我束缚", rk:"挣脱", rd:"逃离困境" },
          { id:31, uk:"想得多焦虑", ud:"失眠焦虑", rk:"长期焦虑", rd:"状态极差" },
          { id:32, uk:"彻底结束", ud:"关系终结", rk:"藕断丝连", rd:"未断干净" },
          { id:33, uk:"张望找机会", ud:"不专心", rk:"难推进", rd:"压力大不想做" },
          { id:34, uk:"主动推进", ud:"积极明确", rk:"想法不一", rd:"难以沟通" },
          { id:35, uk:"有原则直接", ud:"理性直接", rk:"挑剔", rd:"苛刻主观" },
          { id:36, uk:"责任担当", ud:"执行力强", rk:"欺骗", rd:"隐瞒不负责任" },
          { id:37, uk:"有规划新开始", ud:"脚踏实地", rk:"没规划", rd:"无目标" },
          { id:38, uk:"平衡权衡", ud:"计较得失", rk:"失衡", rd:"利益失衡" },
          { id:39, uk:"学习讨论", ud:"交流咨询", rk:"第三方", rd:"他人挑拨" },
          { id:40, uk:"稳定保守", ud:"维持现状", rk:"不稳定", rd:"发展不稳" },
          { id:41, uk:"发展慢", ud:"物质影响", rk:"回暖", rd:"感情回升" },
          { id:42, uk:"付出平衡", ud:"平等付出", rk:"三角关系", rd:"付出不均" },
          { id:43, uk:"思考安排", ud:"犹豫规划", rk:"关系不稳", rd:"摇摇欲坠" },
          { id:44, uk:"专注自身", ud:"忙于事业", rk:"付出少回报", rd:"不愿投入" },
          { id:45, uk:"享乐享受", ud:"物质丰富", rk:"过于享乐", rd:"不务实" },
          { id:46, uk:"合家欢乐", ud:"家庭和睦", rk:"现实危机", rd:"易分离" },
          { id:47, uk:"有规划慢发展", ud:"稳步发展", rk:"没规划", rd:"易受影响" },
          { id:48, uk:"稳定专一", ud:"现实专一", rk:"不专一", rd:"精力分散" },
          { id:49, uk:"踏实认真", ud:"愿意付出", rk:"不踏实", rd:"缺乏责任心" },
          { id:50, uk:"顾家负责", ud:"兑现承诺", rk:"不负责", rd:"出轨逃避" },
          { id:51, uk:"主动出击", ud:"三分钟热度", rk:"不主动", rd:"没兴趣" },
          { id:52, uk:"观望权衡", ud:"看外界", rk:"回归现实", rd:"放弃空想" },
          { id:53, uk:"出发行动", ud:"遇新感情", rk:"想放下", rd:"疲惫放弃" },
          { id:54, uk:"发展稳定", ud:"桃花优质", rk:"不稳定", rd:"异地聚少离多" },
          { id:55, uk:"冲突争执", ud:"吵架矛盾", rk:"退让妥协", rd:"冲突平息" },
          { id:56, uk:"成功吸引", ud:"有魅力", rk:"无吸引力", rd:"沟通变差" },
          { id:57, uk:"克服困难", ud:"独自抗压", rk:"难克服", rd:"想放弃" },
          { id:58, uk:"快速推进", ud:"同频共鸣", rk:"推进不顺", rd:"他人不支持" },
          { id:59, uk:"防御防备", ud:"沟通隔阂", rk:"放下防备", rd:"顺利发展" },
          { id:60, uk:"忙迷茫", ud:"压力巨大", rk:"想放弃", rd:"濒临分手" },
          { id:61, uk:"感兴趣", ud:"积极主动", rk:"没兴趣", rd:"好感下降" },
          { id:62, uk:"积极主动", ud:"讨好对方", rk:"不主动", rd:"吸引力下降" },
          { id:63, uk:"积极负责", ud:"有主见", rk:"不负责", rd:"闹脾气" },
          { id:64, uk:"专一负责", ud:"主导关系", rk:"不专一", rd:"大男子主义" },
          { id:65, uk:"沟通喜欢", ud:"新人聊得来", rk:"不沟通", rd:"关系难推进" },
          { id:66, uk:"沟通平衡", ud:"双向奔赴", rk:"沟通失衡", rd:"敷衍有误会" },
          { id:67, uk:"社交愉快", ud:"人缘好", rk:"第三方干扰", rd:"感情不稳" },
          { id:68, uk:"爱搭不理", ud:"看不上示好", rk:"放下过去", rd:"关系破冰" },
          { id:69, uk:"情绪失落", ud:"只看缺点", rk:"释怀", rd:"情绪转好" },
          { id:70, uk:"主动关爱", ud:"提供情绪价值", rk:"单方付出", rd:"乏味有竞争" },
          { id:71, uk:"做梦画饼", ud:"不切实际", rk:"梦想破灭", rd:"看清真相" },
          { id:72, uk:"想离开", ud:"纠结犹豫", rk:"无法离开", rd:"拖延耗着" },
          { id:73, uk:"得意满足", ud:"高姿态", rk:"失望", rd:"失去信心" },
          { id:74, uk:"合家欢乐", ud:"稳定结婚", rk:"分离", rd:"濒临分手" },
          { id:75, uk:"主动关心", ud:"聊天愉快", rk:"沟通变差", rd:"打击对方" },
          { id:76, uk:"沟通贴心", ud:"温柔细心", rk:"欺骗", rd:"光说不做" },
          { id:77, uk:"不满意低落", ud:"要求高", rk:"沟通阻碍", rd:"冷战断联" },
          { id:78, uk:"浪漫情商高", ud:"完美情人", rk:"渣男", rd:"欺骗出轨" }
        ]
      };
      
      return res.json(config);
    }
    
    return res.status(404).json({ error: 'Not Found' });
    
  } catch (e) {
    console.error('API 错误:', e);
    return res.status(500).json({ error: '服务器错误: ' + e.message });
  }
}