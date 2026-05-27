/**
 * 塔罗牌后端 API - Vercel Functions + Supabase
 */

const crypto = require('crypto');

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
  const { Pool } = require('pg');
  
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
    // 数据库连接
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    
    // 自动建表（首次访问时自动创建）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL
      )
    `);
    await pool.query(`
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
    await pool.query(`
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
    
    // 训练系统表（与上方业务表统一在此自动创建）
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_progress (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        card_id INT NOT NULL,
        orientation VARCHAR(10) NOT NULL CHECK (orientation IN ('upright', 'reversed')),
        progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
        correct_count INT DEFAULT 0,
        error_count INT DEFAULT 0,
        last_time TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, card_id, orientation)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_errors (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        card_id INT NOT NULL,
        orientation VARCHAR(10) NOT NULL CHECK (orientation IN ('upright', 'reversed')),
        error_count INT DEFAULT 0,
        last_error_time TIMESTAMPTZ DEFAULT NOW(),
        continuous_correct INT DEFAULT 0,
        UNIQUE(user_id, card_id, orientation)
      )
    `);
    await pool.query(`
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
      
      await pool.query('DELETE FROM card_meanings WHERE user_id = $1', [userPayload.userId]);
      
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (card && card.name) {
          await pool.query(
            'INSERT INTO card_meanings (user_id, card_id, name, upright, reversed, pattern, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
            [userPayload.userId, i + 1, card.name, card.upright || '', card.reversed || '', card.pattern || '']
          );
        }
      }
      
      return res.json({ success: true, count: cards.length });
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
        'SELECT card_id, orientation, progress, correct_count, error_count FROM user_progress WHERE user_id = $1 ORDER BY card_id, orientation',
        [userPayload.userId]
      );
      return res.json(result.rows);
    }
    
    // ==================== 训练系统：更新进度 ====================
    if (req.method === 'POST' && path === '/api/training/progress') {
      const { card_id, orientation, is_correct } = req.body;
      
      if (!card_id || !orientation) {
        return res.status(400).json({ error: '缺少必要参数' });
      }
      
      // 读取当前进度
      const curr = await pool.query(
        'SELECT progress, correct_count, error_count FROM user_progress WHERE user_id = $1 AND card_id = $2 AND orientation = $3',
        [userPayload.userId, card_id, orientation]
      );
      
      const oldProgress = curr.rows[0]?.progress || 0;
      const oldCorrect = curr.rows[0]?.correct_count || 0;
      const oldError = curr.rows[0]?.error_count || 0;
      
      let newProgress;
      if (is_correct) {
        newProgress = Math.min(100, oldProgress + 10);
      } else {
        newProgress = Math.max(0, oldProgress - 15);
      }
      
      await pool.query(
        `INSERT INTO user_progress (user_id, card_id, orientation, progress, correct_count, error_count, last_time)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (user_id, card_id, orientation) DO UPDATE SET
           progress=$4, correct_count=$5, error_count=$6, last_time=NOW()`,
        [userPayload.userId, card_id, orientation,
         newProgress,
         is_correct ? oldCorrect + 1 : oldCorrect,
         is_correct ? oldError : oldError + 1]
      );
      
      return res.json({ progress: newProgress, correct_count: is_correct ? oldCorrect+1 : oldCorrect, error_count: is_correct ? oldError : oldError+1 });
    }
    
    // ==================== 训练系统：删除进度 ====================
    if (req.method === 'DELETE' && path === '/api/training/progress') {
      await pool.query('DELETE FROM user_progress WHERE user_id = $1', [userPayload.userId]);
      return res.json({ success: true });
    }
    
    // ==================== 训练系统：获取错题 ====================
    if (req.method === 'GET' && path === '/api/training/errors') {
      const result = await pool.query(
        'SELECT card_id, orientation, error_count, continuous_correct FROM user_errors WHERE user_id = $1 ORDER BY error_count DESC',
        [userPayload.userId]
      );
      return res.json(result.rows);
    }
    
    // ==================== 训练系统：记录错题 ====================
    if (req.method === 'POST' && path === '/api/training/errors') {
      const { card_id, orientation, is_correct } = req.body;
      
      if (!card_id || !orientation) {
        return res.status(400).json({ error: '缺少必要参数' });
      }
      
      const curr = await pool.query(
        'SELECT error_count, continuous_correct FROM user_errors WHERE user_id = $1 AND card_id = $2 AND orientation = $3',
        [userPayload.userId, card_id, orientation]
      );
      
      const oldErrors = curr.rows[0]?.error_count || 0;
      const oldContCorrect = curr.rows[0]?.continuous_correct || 0;
      
      let newErrors = oldErrors;
      let newContCorrect = oldContCorrect;
      
      if (is_correct) {
        newContCorrect = oldContCorrect + 1;
      } else {
        newErrors = oldErrors + 1;
        newContCorrect = 0;
      }
      
      await pool.query(
        `INSERT INTO user_errors (user_id, card_id, orientation, error_count, last_error_time, continuous_correct)
         VALUES ($1,$2,$3,$4,NOW(),$5)
         ON CONFLICT (user_id, card_id, orientation) DO UPDATE SET
           error_count=$4, last_error_time=NOW(), continuous_correct=$5`,
        [userPayload.userId, card_id, orientation, newErrors, newContCorrect]
      );
      
      return res.json({ error_count: newErrors, continuous_correct: newContCorrect });
    }
    
    // ==================== 训练系统：清除错题 ====================
    if (req.method === 'DELETE' && path === '/api/training/errors') {
      const { card_id, orientation } = req.body;
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
    
    return res.status(404).json({ error: 'Not Found' });
    
  } catch (e) {
    console.error('API 错误:', e);
    return res.status(500).json({ error: '服务器错误: ' + e.message });
  }
}