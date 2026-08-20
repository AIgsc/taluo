/**
 * 同步本地代码中的默认输入变量到数据库
 * 解决问题：本地修改 business-model.js 后，数据库中还是旧的默认值
 * 
 * 使用方法：
 *   node scripts/sync-default-model.js [--dry-run]
 *   --dry-run 只显示不保存
 */

require('dotenv').config();
const { Pool } = require('pg');
const BusinessModel = require('../海鲜自助项目计划书/business-model.js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('=== 同步本地默认输入变量到数据库 ===');
  console.log('');
  
  // 读取当前数据库中的模型
  const result = await pool.query(
    'SELECT value FROM business_plan_model WHERE model_key = $1',
    ['model_inputs']
  );
  
  let currentModel = null;
  if (result.rows.length > 0) {
    try {
      currentModel = JSON.parse(result.rows[0].value);
      console.log('当前数据库已有模型变量，共 ' + Object.keys(currentModel).length + ' 个输入项');
    } catch (e) {
      console.log('当前数据库模型解析失败，将覆盖');
      currentModel = null;
    }
  } else {
    console.log('数据库中没有模型数据，将创建新记录');
  }
  
  console.log('');
  console.log('本地代码默认变量，共 ' + Object.keys(BusinessModel.defaultInputs).length + ' 个输入项：');
  console.log(JSON.stringify(BusinessModel.defaultInputs, null, 2));
  console.log('');
  
  if (currentModel) {
    // 对比差异
    const localKeys = Object.keys(BusinessModel.defaultInputs);
    const dbKeys = Object.keys(currentModel);
    
    console.log('差异对比：');
    let changed = 0;
    
    localKeys.forEach(key => {
      const localVal = BusinessModel.defaultInputs[key];
      const dbVal = currentModel[key];
      
      if (dbVal === undefined) {
        console.log('  + 新增: ' + key + ' = ' + localVal);
        changed++;
      } else if (localVal !== dbVal) {
        console.log('  ~ 变更: ' + key + ' 数据库=' + dbVal + ' → 本地=' + localVal);
        changed++;
      }
    });
    
    dbKeys.forEach(key => {
      if (BusinessModel.defaultInputs[key] === undefined) {
        console.log('  - 删除: ' + key + ' (数据库中存在，本地不存在)');
        changed++;
      }
    });
    
    console.log('');
    console.log('共 ' + changed + ' 处变更');
    console.log('');
  }
  
  if (!dryRun) {
    console.log('正在保存到数据库...');
    
    await pool.query(
      `INSERT INTO business_plan_model (model_key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (model_key) DO UPDATE SET
         value = $2, updated_at = NOW()`,
      ['model_inputs', JSON.stringify(BusinessModel.defaultInputs)]
    );
    
    console.log('');
    console.log('✅ 保存成功！');
    console.log('');
    console.log('下一步：');
    console.log('  1. 本地推送代码到 GitHub');
    console.log('  2. Vercel 自动部署后，网页使用最新数据');
  } else {
    console.log('干运行模式，未实际保存');
  }
  
  await pool.end();
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
