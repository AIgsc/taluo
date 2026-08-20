/**
 * 同步脚本：将 content-data.json 中的内容写入 index.html
 * 使用方式：node sync-html.js
 *
 * 流程：
 * 1. 读取 content-data.json（保存服务器写入的编辑内容）
 * 2. 读取 index.html
 * 3. 更新每个 data-edit 区块的内容
 * 4. 写回 index.html
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'content-data.json');
const HTML_FILE = path.join(__dirname, 'index.html');

// ==================== 主逻辑 ====================

function main() {
  // 1. 检查数据文件
  if (!fs.existsSync(DATA_FILE)) {
    console.error('未找到 content-data.json，请先在前端编辑并保存内容。');
    console.error('或者先启动保存服务器：node save-server.js');
    process.exit(1);
  }

  // 2. 读取数据
  const content = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const keys = Object.keys(content);
  if (keys.length === 0) {
    console.log('content-data.json 为空，无需同步。');
    return;
  }

  console.log('共读取 ' + keys.length + ' 个区块: ' + keys.join(', '));

  // 3. 读取 HTML
  let html = fs.readFileSync(HTML_FILE, 'utf-8');
  let updatedCount = 0;

  // 4. 逐个替换 data-edit 区块
  for (const key of keys) {
    const newHtml = replaceDataEditContent(html, key, content[key]);
    if (newHtml !== html) {
      html = newHtml;
      updatedCount++;
      console.log('  ✓ 已更新: data-edit="' + key + '"');
    } else {
      console.log('  - 未找到: data-edit="' + key + '"');
    }
  }

  // 5. 写回 HTML
  fs.writeFileSync(HTML_FILE, html, 'utf-8');
  console.log('\n同步完成！已更新 ' + updatedCount + '/' + keys.length + ' 个区块。');
  console.log('刷新页面即可看到最新内容。');
}

// ==================== HTML 替换函数 ====================

/**
 * 在 HTML 中找到 data-edit="key" 的元素，替换其 innerHTML
 * 通过计数同类型标签的嵌套深度来找到正确的闭合标签
 */
function replaceDataEditContent(html, key, newContent) {
  const attr = 'data-edit="' + key + '"';
  const attrIndex = html.indexOf(attr);

  if (attrIndex === -1) return html;

  // 向前找到标签开始位置 <
  const beforeAttr = html.substring(0, attrIndex);
  const tagStart = beforeAttr.lastIndexOf('<');
  if (tagStart === -1) return html;

  // 提取标签名
  const tagPart = html.substring(tagStart);
  const tagNameMatch = tagPart.match(/^<(\w+)/);
  if (!tagNameMatch) return html;
  const tagName = tagNameMatch[1];

  // 找到开始标签的结束位置 >
  const afterAttr = html.substring(attrIndex + attr.length);
  const openTagEndRel = afterAttr.indexOf('>');
  if (openTagEndRel === -1) return html;

  const contentStart = attrIndex + attr.length + openTagEndRel + 1;
  const closingTag = '</' + tagName + '>';

  // 从内容起始位置开始，找到匹配的闭合标签
  let depth = 1;
  let pos = contentStart;
  const openTag = '<' + tagName;

  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf(openTag, pos);
    const nextClose = html.indexOf(closingTag, pos);

    // 没有闭合标签了
    if (nextClose === -1) return html;

    // 判断下一个是开标签还是闭标签
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      pos = nextClose + closingTag.length;
    }
  }

  if (depth !== 0) return html;

  // 内容范围: [contentStart, pos - closingTag.length)
  const contentEnd = pos - closingTag.length;

  // 替换
  return html.substring(0, contentStart) + '\n' + newContent + '\n' + html.substring(contentEnd);
}

main();