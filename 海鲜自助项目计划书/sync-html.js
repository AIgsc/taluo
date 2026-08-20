/**
 * 同步脚本：从数据库读取商业计划书内容，写入 index.html
 * 使用方式：node sync-html.js
 *
 * 前置条件：DATABASE_URL 环境变量已设置
 * 运行后：将数据库中的编辑内容同步到 HTML 文件，然后提交部署
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const HTML_FILE = path.join(__dirname, 'index.html');

// ==================== 从数据库读取内容 ====================

async function fetchContentFromDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('错误：未设置 DATABASE_URL 环境变量');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    const result = await pool.query(
      'SELECT section_key, content FROM business_plan_content ORDER BY section_key'
    );
    const content = {};
    result.rows.forEach(function(row) {
      content[row.section_key] = row.content;
    });
    return content;
  } finally {
    await pool.end();
  }
}

// ==================== HTML 替换函数 ====================

/**
 * 在 HTML 中找到 data-edit="key" 的元素，替换其 innerHTML
 * 通过计数同类型标签的嵌套深度来找到正确的闭合标签
 */
function replaceDataEditContent(html, key, newContent) {
  const attr = 'data-edit="' + key + '"';
  const attrIndex = html.indexOf(attr);

  if (attrIndex === -1) return null;

  // 向前找到标签开始位置 <
  const beforeAttr = html.substring(0, attrIndex);
  const tagStart = beforeAttr.lastIndexOf('<');
  if (tagStart === -1) return null;

  // 提取标签名
  const tagPart = html.substring(tagStart);
  const tagNameMatch = tagPart.match(/^<(\w+)/);
  if (!tagNameMatch) return null;
  const tagName = tagNameMatch[1];

  // 找到开始标签的结束位置 >
  const afterAttr = html.substring(attrIndex + attr.length);
  const openTagEndRel = afterAttr.indexOf('>');
  if (openTagEndRel === -1) return null;

  const contentStart = attrIndex + attr.length + openTagEndRel + 1;
  const closingTag = '</' + tagName + '>';

  // 从内容起始位置开始，找到匹配的闭合标签
  let depth = 1;
  let pos = contentStart;
  const openTag = '<' + tagName;

  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf(openTag, pos);
    const nextClose = html.indexOf(closingTag, pos);

    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      pos = nextClose + closingTag.length;
    }
  }

  if (depth !== 0) return null;

  const contentEnd = pos - closingTag.length;
  return html.substring(0, contentStart) + '\n' + newContent + '\n' + html.substring(contentEnd);
}

// ==================== 主逻辑 ====================

async function main() {
  console.log('正在从数据库读取内容...');
  const content = await fetchContentFromDB();

  const keys = Object.keys(content);
  if (keys.length === 0) {
    console.log('数据库中暂无商业计划书内容，无需同步。');
    return;
  }

  console.log('共读取 ' + keys.length + ' 个区块: ' + keys.join(', '));

  // 读取 HTML
  let html = fs.readFileSync(HTML_FILE, 'utf-8');
  let updatedCount = 0;

  // 逐个替换 data-edit 区块
  for (const key of keys) {
    const result = replaceDataEditContent(html, key, content[key]);
    if (result !== null) {
      html = result;
      updatedCount++;
      console.log('  ✓ 已更新: data-edit="' + key + '"');
    } else {
      console.log('  - 未找到: data-edit="' + key + '"');
    }
  }

  // 写回 HTML
  fs.writeFileSync(HTML_FILE, html, 'utf-8');
  console.log('\n同步完成！已更新 ' + updatedCount + '/' + keys.length + ' 个区块。');
  console.log('现在可以提交并部署到 Vercel：');
  console.log('  git add .');
  console.log('  git commit -m "更新商业计划书内容"');
  console.log('  git push origin main');
}

main().catch(function(err) {
  console.error('同步失败:', err.message);
  process.exit(1);
});