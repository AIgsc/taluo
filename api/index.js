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
    
    // ==================== 健康检查 ====================
    if (req.method === 'GET' && path === '/api/health') {
      return res.json({ status: 'ok', timestamp: Date.now() });
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
    
    // ==================== 获取历史记录 ====================
    if (req.method === 'GET' && path === '/api/records') {
      const result = await pool.query(
        'SELECT record_id, created_at, timestamp, rounds, game_state, current_round, full_deck, cached_numbers, re_sort_count, lock_picking, lock_current_main_delete, type, title FROM taro_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000',
        [userPayload.userId]
      );
      
      const history = result.rows.map(row => ({
        id: row.record_id,
        timestamp: row.timestamp,
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
    
    // ==================== 获取所有牌义 ====================
    if (req.method === 'GET' && path === '/api/card-meanings') {
      const result = await pool.query(
        'SELECT card_id, name, upright, reversed, pattern FROM card_meanings ORDER BY card_id ASC'
      );
      
      const meanings = {};
      result.rows.forEach(row => {
        meanings[row.card_id] = {
          name: row.name,
          upright: row.upright,
          reversed: row.reversed,
          pattern: row.pattern
        };
      });
      
      return res.json(meanings);
    }
    
    // ==================== 初始化牌义 ====================
    if (req.method === 'POST' && path === '/api/card-meanings/seed') {
      const { cards } = req.body;
      
      if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: '牌义数据不能为空' });
      }
      
      await pool.query('DELETE FROM card_meanings');
      
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (card && card.name) {
          await pool.query(
            'INSERT INTO card_meanings (card_id, name, upright, reversed, pattern) VALUES ($1, $2, $3, $4, $5)',
            [i + 1, card.name, card.upright || '', card.reversed || '', card.pattern || '']
          );
        }
      }
      
      return res.json({ success: true, count: cards.length });
    }
    
    // ==================== 更新单张牌义 ====================
    if (req.method === 'PUT' && path.startsWith('/api/card-meanings/')) {
      const cardId = parseInt(path.split('/api/card-meanings/')[1]);
      
      if (isNaN(cardId) || cardId < 1 || cardId > 78) {
        return res.status(400).json({ error: '无效的牌ID' });
      }
      
      const { name, upright, reversed, pattern } = req.body;
      
      const existing = await pool.query('SELECT card_id FROM card_meanings WHERE card_id = $1', [cardId]);
      
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE card_meanings SET name = $1, upright = $2, reversed = $3, pattern = $4 WHERE card_id = $5',
          [name || '', upright || '', reversed || '', pattern || '', cardId]
        );
      } else {
        await pool.query(
          'INSERT INTO card_meanings (card_id, name, upright, reversed, pattern) VALUES ($1, $2, $3, $4, $5)',
          [cardId, name || '', upright || '', reversed || '', pattern || '']
        );
      }
      
      return res.json({ success: true });
    }
    
    return res.status(404).json({ error: 'Not Found' });
    
  } catch (e) {
    console.error('API 错误:', e);
    return res.status(500).json({ error: '服务器错误: ' + e.message });
  }
}