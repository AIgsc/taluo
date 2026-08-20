#!/bin/bash
#
# sync-local-to-db.sh - 同步本地代码默认输入变量到数据库
#
# 使用方法：
#   ./sync-local-to-db.sh [API_URL]
#
# 示例：
#   ./sync-local-to-db.sh https://taluo.shuone.com/api/business-plan/sync-inputs
#
# 解决问题：
#   本地修改 business-model.js 后，数据库中还是旧的默认值
#   运行此脚本将本地代码中的默认值同步到数据库

set -e

# 默认 API URL
API_URL="${1:-https://taluo.shuone.com/api/business-plan/sync-inputs}"

echo "=== 同步本地代码默认输入变量到数据库 ==="
echo "API URL: $API_URL"
echo ""

# 提取本地默认输入变量并包装为 { model: ... } 格式
BODY=$(node -e "
const m = require('./海鲜自助项目计划书/business-model.js');
console.log(JSON.stringify({ model: m.defaultInputs }));
")

echo "提取本地输入变量完成"
echo ""

# 发送到 API
echo "正在发送到 API..."
echo "$BODY" | curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d @- \
  -w "\n\nHTTP 状态码: %{http_code}\n"

echo ""
echo "✅ 同步完成！"
echo ""
echo "说明："
echo "  1. 数据库已使用本地代码中的默认输入变量"
echo "  2. 接下来 git push 推送到 GitHub"
echo "  3. Vercel 自动部署，网页使用最新数据"