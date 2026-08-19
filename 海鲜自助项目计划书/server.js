/**
 * 海鲜自助项目计划书 - 独立后端服务器
 * 与塔罗项目完全无关，独立数据库连接，独立端口运行
 * 首次请求自动创建数据库表，后续不再重复创建
 *
 * 启动方式：
 *   DATABASE_URL=postgresql://... node server.js
 *   或设置环境变量后启动
 */

const http = require('http');
const { Pool } = require('pg');

// ==================== 数据库连接池 ====================
let pool = null;
function getPool() {
  if (!pool) {
    const dbUrl = process.env.BP_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('错误：请设置环境变量 BP_DATABASE_URL 或 DATABASE_URL');
      process.exit(1);
    }
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });
    console.log('[商业计划书] 数据库连接池已创建');
  }
  return pool;
}

// ==================== 自动建表（仅首次执行） ====================
let tablesCreated = false;
async function ensureTables() {
  if (tablesCreated) return;
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS business_plan_content (
      id SERIAL PRIMARY KEY,
      section_key VARCHAR(255) NOT NULL UNIQUE,
      content TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  tablesCreated = true;
  console.log('[商业计划书] 数据库表初始化完成');
}

// ==================== 请求体解析 ====================
function parseBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(chunk) { chunks.push(chunk); });
    req.on('end', function() {
      var raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('无效的 JSON 请求体'));
      }
    });
    req.on('error', reject);
  });
}

// ==================== 发送 JSON 响应 ====================
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// ==================== 路由处理 ====================
async function handleRequest(req, res) {
  var path = req.url.split('?')[0];
  var method = req.method;

  // CORS 预检
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // 确保数据库表已创建
  try {
    await ensureTables();
  } catch (e) {
    console.error('[商业计划书] 数据库初始化失败:', e.message);
    sendJSON(res, 500, { error: '数据库初始化失败' });
    return;
  }

  try {
    var db = getPool();

    // ==================== 健康检查 ====================
    if (method === 'GET' && path === '/api/business-plan/health') {
      sendJSON(res, 200, { status: 'ok', name: 'business-plan-server', version: '1.0.0' });
      return;
    }

    // ==================== 加载所有已保存内容 ====================
    if (method === 'GET' && path === '/api/business-plan') {
      var result = await db.query(
        'SELECT section_key, content FROM business_plan_content ORDER BY section_key'
      );
      var content = {};
      result.rows.forEach(function(row) {
        content[row.section_key] = row.content;
      });
      sendJSON(res, 200, { content: content });
      return;
    }

    // ==================== 保存内容 ====================
    if (method === 'POST' && path === '/api/business-plan') {
      var body = await parseBody(req);
      var content = body.content;

      if (!content || typeof content !== 'object') {
        sendJSON(res, 400, { error: '内容数据不能为空' });
        return;
      }

      var keys = Object.keys(content);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var val = content[key];
        if (typeof val === 'string') {
          await db.query(
            `INSERT INTO business_plan_content (section_key, content, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (section_key) DO UPDATE SET
               content = $2, updated_at = NOW()`,
            [key, val]
          );
        }
      }

      console.log('[商业计划书] 已保存 ' + keys.length + ' 个区块内容');
      sendJSON(res, 200, { success: true, count: keys.length });
      return;
    }

    // ==================== 404 ====================
    sendJSON(res, 404, { error: 'Not Found' });

  } catch (e) {
    console.error('[商业计划书] 服务器错误:', e);
    sendJSON(res, 500, { error: '服务器内部错误' });
  }
}

// ==================== 启动服务器 ====================
var PORT = parseInt(process.env.BP_PORT || '3001', 10);

var server = http.createServer(handleRequest);
server.listen(PORT, function() {
  console.log('========================================');
  console.log('  海鲜自助项目计划书 - 独立后端服务器');
  console.log('  地址: http://localhost:' + PORT);
  console.log('  API:  http://localhost:' + PORT + '/api/business-plan');
  console.log('  健康: http://localhost:' + PORT + '/api/business-plan/health');
  console.log('========================================');
});