/**
 * 本地保存服务器
 * 启动：node save-server.js
 * 前端编辑内容会通过 POST /save 保存到 content-data.json
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3456;
const DATA_FILE = path.join(__dirname, 'content-data.json');

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.content || typeof data.content !== 'object') {
          return sendJSON(res, 400, { error: '内容数据不能为空' });
        }

        // 保存到 JSON 文件
        fs.writeFileSync(DATA_FILE, JSON.stringify(data.content, null, 2), 'utf-8');
        console.log('已保存 ' + Object.keys(data.content).length + ' 个区块到 content-data.json');
        sendJSON(res, 200, { success: true, count: Object.keys(data.content).length });
      } catch (e) {
        console.error('保存失败:', e.message);
        sendJSON(res, 500, { error: e.message });
      }
    });
    return;
  }

  // 404
  sendJSON(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log('保存服务器已启动: http://localhost:' + PORT);
  console.log('POST /save - 保存编辑内容到 content-data.json');
});