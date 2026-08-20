/**
 * 同步待办数据到数据库
 * 读取本地 HTML 中的 DEFAULT_DATA，更新到数据库的 todo_progress 表
 * 
 * 使用方法：
 *   DATABASE_URL=postgresql://... node scripts/sync-todo-data.js
 * 
 * 前置条件：DATABASE_URL 环境变量已设置
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const TODO_HTML = path.join(__dirname, '..', '海鲜自助项目计划书', '待办工作进度.html');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('错误：未设置 DATABASE_URL 环境变量');
    console.error('使用方法: DATABASE_URL=postgresql://... node scripts/sync-todo-data.js');
    process.exit(1);
  }

  // 1. 读取 HTML 文件
  const html = fs.readFileSync(TODO_HTML, 'utf-8');
  
  // 2. 提取 DEFAULT_DATA 对象
  // 匹配 var DEFAULT_DATA = { ... };
  const match = html.match(/var DEFAULT_DATA\s*=\s*({[\s\S]*?});\s*\n\s*\/\/\s*====================/);
  if (!match) {
    console.error('错误：未找到 DEFAULT_DATA');
    process.exit(1);
  }
  
  // 3. 解析 JSON
  // 需要处理 JavaScript 对象中的注释和特殊格式
  let jsonStr = match[1];
  // 移除注释
  jsonStr = jsonStr.replace(/\/\/.*$/gm, '');
  // 尝试解析
  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch (e) {
    console.error('JSON 解析失败:', e.message);
    // Try to fix common issues - trailing commas
    try {
      jsonStr = jsonStr
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/,\s*$/, '');
      data = JSON.parse(jsonStr);
    } catch (e2) {
      console.error('修复后仍然解析失败:', e2.message);
      process.exit(1);
    }
  }
  
  console.log('已读取 DEFAULT_DATA，共 ' + data.categories.length + ' 个分类');
  var totalItems = data.categories.reduce(function(sum, c) { return sum + c.items.length; }, 0);
  console.log('共 ' + totalItems + ' 个待办项');
  
  // 4. 连接数据库并更新
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  
  try {
    // 检查表是否存在
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'todo_progress'
      ) as exists
    `);
    
    if (!checkResult.rows[0].exists) {
      console.error('错误：todo_progress 表不存在，请先启动 API 服务器');
      process.exit(1);
    }
    
    // 更新数据
    await pool.query(
      `UPDATE todo_progress SET data = $1::jsonb, updated_at = NOW() 
       WHERE id = (SELECT id FROM todo_progress ORDER BY id DESC LIMIT 1)`,
      [JSON.stringify(data)]
    );
    
    console.log('✅ 数据库更新成功！');
    console.log('共更新 ' + data.categories.length + ' 个分类，' + totalItems + ' 个待办项');
    
  } finally {
    await pool.end();
  }
}

main().catch(function(err) {
  console.error('同步失败:', err.message);
  process.exit(1);
});