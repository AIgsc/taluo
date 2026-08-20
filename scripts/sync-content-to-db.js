/**
 * 同步本地 HTML 中的文字内容到数据库
 * 解决问题：本地修改 index.html（data-edit 区块）后，数据库中还是旧内容
 * 
 * 使用方法：
 *   node scripts/sync-content-to-db.js [--dry-run]
 *   --dry-run 只显示不保存
 * 
 * 前置条件：DATABASE_URL 环境变量已设置
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, '..', '海鲜自助项目计划书', 'index.html');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * 从 HTML 中提取所有 data-edit 区块的内容
 * 通过正则匹配 data-edit="key" 并提取标签内的内容
 */
function extractDataEditContent(html) {
  const content = {};
  // 正则匹配: <tag ... data-edit="key" ... >内容</tag>
  // 注意：需要处理嵌套标签，所以用递归方式
  const regex = /<(\w+)[^>]*\sdata-edit="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const key = match[2];
    const innerContent = match[3].trim();
    content[key] = innerContent;
  }
  
  return content;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('=== 同步本地 HTML 文字内容到数据库 ===');
  console.log('');
  
  // 1. 读取 HTML
  if (!fs.existsSync(HTML_FILE)) {
    console.error('错误：未找到 index.html 文件');
    process.exit(1);
  }
  
  const html = fs.readFileSync(HTML_FILE, 'utf-8');
  console.log('已读取 HTML 文件: ' + HTML_FILE);
  
  // 2. 提取 data-edit 内容
  const localContent = extractDataEditContent(html);
  const keys = Object.keys(localContent);
  
  if (keys.length === 0) {
    console.log('未找到 data-edit 区块，无需同步。');
    await pool.end();
    return;
  }
  
  console.log('本地 HTML 中共 ' + keys.length + ' 个 data-edit 区块:');
  keys.forEach(function(key) {
    const preview = localContent[key].substring(0, 60).replace(/\n/g, ' ');
    console.log('  ' + key + ' → "' + preview + (localContent[key].length > 60 ? '...' : '') + '"');
  });
  console.log('');

  if (dryRun) {
    console.log('✅ 干运行模式完成，HTML 内容读取正常。');
    console.log('（未连接数据库，仅展示本地内容）');
    await pool.end();
    return;
  }

  // 3. 读取数据库现有内容，对比差异
  console.log('正在连接数据库...');
  const result = await pool.query(
    'SELECT section_key, content FROM business_plan_content ORDER BY section_key'
  );
  
  const dbContent = {};
  result.rows.forEach(function(row) {
    dbContent[row.section_key] = row.content;
  });
  
  console.log('数据库中共 ' + Object.keys(dbContent).length + ' 个区块');
  console.log('');
  
  // 4. 对比差异
  let changed = 0;
  let added = 0;
  
  keys.forEach(function(key) {
    const localVal = localContent[key].trim();
    const dbVal = dbContent[key] ? dbContent[key].trim() : null;
    
    if (dbVal === null) {
      console.log('  + 新增: ' + key);
      added++;
      changed++;
    } else if (localVal !== dbVal) {
      console.log('  ~ 变更: ' + key);
      console.log('    数据库: ' + dbVal.substring(0, 80).replace(/\n/g, ' '));
      console.log('    本地:   ' + localVal.substring(0, 80).replace(/\n/g, ' '));
      changed++;
    }
  });
  
  console.log('');
  console.log('共 ' + changed + ' 处变更（新增 ' + added + '，修改 ' + (changed - added) + '）');
  console.log('');
  
  // 5. 保存到数据库
  if (changed === 0) {
    console.log('无变更，无需保存。');
  } else {
    console.log('正在保存到数据库...');
    
    for (const key of keys) {
      const val = localContent[key].trim();
      if (val) {
        await pool.query(
          `INSERT INTO business_plan_content (section_key, content, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (section_key) DO UPDATE SET
             content = $2, updated_at = NOW()`,
          [key, val]
        );
      }
    }
    
    console.log('✅ 保存成功！共更新 ' + changed + ' 个区块。');
    console.log('');
    console.log('现在数据库中的文字内容已与本地 HTML 一致。');
    console.log('推送代码后，Vercel 部署的页面加载时将使用最新内容。');
  }
  
  await pool.end();
}

main().catch(function(err) {
  console.error('错误:', err);
  process.exit(1);
});