/**
 * 海鲜自助项目计划书 - 在线编辑功能 v3
 * 双向同步：本地代码 ↔ 数据库 ↔ 前台页面
 * 
 * 核心逻辑：
 * 1. 页面加载 → 先用代码渲染 → 调 API 对比哈希
 * 2. 哈希匹配 → 数据库有用户编辑 → 应用数据库内容
 * 3. 哈希不匹配 → 代码最新 → 保留 HTML，后台同步到数据库
 * 4. 用户保存 → 写数据库 + 更新哈希 → 闭环
 */

(function() {
  'use strict';

  var API_URL = window.BP_API_URL || '/api/business-plan';
  var editMode = false;
  var varMode = false;
  var hasChanges = false;

  // ==================== 创建浮动工具栏 ====================
  function createToolbar() {
    var bar = document.createElement('div');
    bar.id = 'bp-toolbar';
    bar.innerHTML =
      '<button id="bp-edit-btn" class="bp-btn bp-btn-edit">编辑文字</button>' +
      '<button id="bp-var-btn" class="bp-btn bp-btn-var">编辑变量</button>' +
      '<button id="bp-save-btn" class="bp-btn bp-btn-save" style="display:none">保存修改</button>' +
      '<span id="bp-status" class="bp-status"></span>';

    var style = document.createElement('style');
    style.textContent =
      '#bp-toolbar{' +
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
        'z-index:9999;background:#1a5276;color:#fff;padding:12px 24px;' +
        'border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);' +
        'display:flex;align-items:center;gap:12px;font-size:14px;' +
        'transition:opacity 0.3s;touch-action:manipulation;' +
      '}' +
      '#bp-toolbar .bp-btn{' +
        'border:none;padding:10px 20px;border-radius:8px;cursor:pointer;' +
        'font-size:15px;font-weight:600;transition:all 0.2s;' +
        'touch-action:manipulation;-webkit-tap-highlight-color:rgba(255,255,255,0.2);' +
      '}' +
      '#bp-toolbar .bp-btn-edit{background:#5dade2;color:#fff;}' +
      '#bp-toolbar .bp-btn-edit:hover{background:#2e86c1;}' +
      '#bp-toolbar .bp-btn-var{background:#8e44ad;color:#fff;}' +
      '#bp-toolbar .bp-btn-var:hover{background:#6c3483;}' +
      '#bp-toolbar .bp-btn-save{background:#27ae60;color:#fff;}' +
      '#bp-toolbar .bp-btn-save:hover{background:#1e8449;}' +
      '#bp-toolbar .bp-status{font-size:12px;color:rgba(255,255,255,0.7);}' +
      '.bp-editing{outline:2px dashed #5dade2 !important;outline-offset:2px !important;border-radius:4px !important;cursor:text !important;user-select:text !important;-webkit-user-select:text !important;-webkit-touch-callout:default !important;}' +
      '.bp-editing:hover{background:rgba(93,173,226,0.05) !important;}' +
      '.bp-saving{opacity:0.5;pointer-events:none;}' +
      '.bp-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;}' +
      '.bp-modal{background:#fff;color:#333;border-radius:12px;padding:24px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);}' +
      '.bp-modal h3{margin:0 0 16px 0;font-size:16px;color:#1a5276;}' +
      '.bp-var-group{margin-bottom:12px;}' +
      '.bp-var-group label{display:block;font-size:12px;color:#666;margin-bottom:2px;}' +
      '.bp-var-group input{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;}' +
      '.bp-var-group input:focus{outline:none;border-color:#5dade2;box-shadow:0 0 0 2px rgba(93,173,226,0.2);}' +
      '.bp-var-section{margin-bottom:12px;padding:8px 0;border-bottom:1px solid #eee;}' +
      '.bp-var-section:last-child{border-bottom:none;}' +
      '.bp-var-section .section-title{font-size:13px;font-weight:600;color:#1a5276;margin-bottom:8px;}' +
      '.bp-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;}' +
      '.bp-modal-actions button{padding:8px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;}' +
      '.bp-modal-actions .bp-btn-primary{background:#1a5276;color:#fff;}' +
      '.bp-modal-actions .bp-btn-primary:hover{background:#154360;}' +
      '.bp-modal-actions .bp-btn-cancel{background:#eee;color:#333;}' +
      '.bp-modal-actions .bp-btn-cancel:hover{background:#ddd;}' +
      '.bp-recalc-note{font-size:11px;color:#888;margin-top:4px;}';

    document.head.appendChild(style);
    document.body.appendChild(bar);

    document.getElementById('bp-edit-btn').addEventListener('click', toggleEdit);
    document.getElementById('bp-var-btn').addEventListener('click', toggleVarModal);
    document.getElementById('bp-save-btn').addEventListener('click', saveContent);
  }

  // ==================== 切换编辑模式 ====================
  function toggleEdit() {
    editMode = !editMode;
    var elements = document.querySelectorAll('[data-edit]');
    elements.forEach(function(el) {
      el.contentEditable = editMode;
      el.classList.toggle('bp-editing', editMode);
    });

    document.getElementById('bp-edit-btn').textContent = editMode ? '完成编辑' : '编辑文字';
    document.getElementById('bp-save-btn').style.display = editMode || varMode ? 'inline-block' : 'none';
    document.getElementById('bp-var-btn').disabled = editMode;
    document.getElementById('bp-var-btn').style.opacity = editMode ? '0.5' : '1';

    if (!editMode) {
      document.getElementById('bp-status').textContent = '';
    }
  }

  // ==================== 变量编辑弹窗 ====================
  function toggleVarModal() {
    if (varMode) {
      closeVarModal();
      return;
    }

    var model = window.BusinessModel;
    if (!model) {
      document.getElementById('bp-status').textContent = '错误：BusinessModel 未加载';
      document.getElementById('bp-status').style.color = '#e74c3c';
      return;
    }

    var inputs = model.getInputs();

    var overlay = document.createElement('div');
    overlay.className = 'bp-modal-overlay';
    overlay.id = 'bp-var-overlay';

    var modal = document.createElement('div');
    modal.className = 'bp-modal';

    modal.innerHTML =
      '<h3>编辑核心变量</h3>' +
      '<p style="font-size:12px;color:#888;margin:-8px 0 12px 0;">修改后所有关联数据自动重新计算，点击「应用并保存」同步到数据库</p>' +
      '<div class="bp-var-section">' +
        '<div class="section-title">场地</div>' +
        '<div class="bp-var-group"><label>总面积（㎡）</label><input type="number" id="var-area" value="' + inputs.area + '"></div>' +
        '<div class="bp-var-group"><label>桌数</label><input type="number" id="var-tableCount" value="' + inputs.tableCount + '"></div>' +
        '<div class="bp-var-group"><label>每桌平均人数</label><input type="number" step="0.1" id="var-seatsPerTable" value="' + inputs.seatsPerTable + '"></div>' +
      '</div>' +
      '<div class="bp-var-section">' +
        '<div class="section-title">人员架构</div>' +
        '<div class="bp-var-group"><label>总编制人数</label><input type="number" id="var-staffCount" value="' + inputs.staffCount + '"></div>' +
        '<div class="bp-var-group"><label>后厨人数</label><input type="number" id="var-kitchenStaff" value="' + inputs.kitchenStaff + '"></div>' +
        '<div class="bp-var-group"><label>后厨月度总成本（元）</label><input type="number" id="var-kitchenCost" value="' + inputs.kitchenCost + '"></div>' +
        '<div class="bp-var-group"><label>前厅人数</label><input type="number" id="var-frontStaff" value="' + inputs.frontStaff + '"></div>' +
        '<div class="bp-var-group"><label>前厅月度总成本（元）</label><input type="number" id="var-frontCost" value="' + inputs.frontCost + '"></div>' +
      '</div>' +
      '<div class="bp-var-section">' +
        '<div class="section-title">营收</div>' +
        '<div class="bp-var-group"><label>人均定价（元）</label><input type="number" id="var-price" value="' + inputs.price + '"></div>' +
        '<div class="bp-var-group"><label>日均核销营业额（元）</label><input type="number" id="var-dailyRevenue" value="' + inputs.dailyRevenue + '"></div>' +
        '<div class="bp-var-group"><label>食材成本率（%）</label><input type="number" id="var-foodCostPct" value="' + inputs.foodCostPct + '"></div>' +
      '</div>' +
      '<div class="bp-var-section">' +
        '<div class="section-title">投资与成本</div>' +
        '<div class="bp-var-group"><label>总投资（元）</label><input type="number" id="var-totalInvestment" value="' + inputs.totalInvestment + '"></div>' +
        '<div class="bp-var-group"><label>装修设备投资（元）</label><input type="number" id="var-equipmentInvestment" value="' + inputs.equipmentInvestment + '"></div>' +
        '<div class="bp-var-group"><label>硬件分摊月数</label><input type="number" id="var-paybackMonths" value="' + inputs.paybackMonths + '"></div>' +
        '<div class="bp-var-group"><label>月人工成本（元）</label><input type="number" id="var-laborCost" value="' + inputs.laborCost + '"></div>' +
        '<div class="bp-var-group"><label>月房租（元）</label><input type="number" id="var-rent" value="' + inputs.rent + '"></div>' +
        '<div class="bp-var-group"><label>水电燃气杂费（元/月）</label><input type="number" id="var-utilityCost" value="' + inputs.utilityCost + '"></div>' +
        '<div class="bp-var-group"><label>其他杂费（元/月）</label><input type="number" id="var-miscCost" value="' + inputs.miscCost + '"></div>' +
      '</div>' +
      '<div class="bp-var-section">' +
        '<div class="section-title">前期一次性投入</div>' +
        '<div class="bp-var-group"><label>组建人工费用（元）</label><input type="number" id="var-staffInitialCost" value="' + inputs.staffInitialCost + '"></div>' +
        '<div class="bp-var-group"><label>首批食材备货（元）</label><input type="number" id="var-foodInitialCost" value="' + inputs.foodInitialCost + '"></div>' +
      '</div>' +
      '<div class="bp-var-section">' +
        '<div class="section-title">分成比例</div>' +
        '<div class="bp-var-group"><label>营销费率（%）</label><input type="number" id="var-marketingPct" value="' + inputs.marketingPct + '"></div>' +
        '<div class="bp-var-group"><label>服务商抽成（%）</label><input type="number" id="var-serviceFeePct" value="' + inputs.serviceFeePct + '"></div>' +
        '<div class="bp-var-group"><label>运营部门分成（%）</label><input type="number" id="var-operationPct" value="' + inputs.operationPct + '"></div>' +
        '<div class="bp-var-group"><label>投资人分红（%）</label><input type="number" id="var-investorPct" value="' + inputs.investorPct + '"></div>' +
        '<div class="bp-var-group"><label>房东超额分成门槛（元）</label><input type="number" id="var-landlordThreshold" value="' + inputs.landlordThreshold + '"></div>' +
        '<div class="bp-var-group"><label>房东超额分成率（%）</label><input type="number" id="var-landlordPct" value="' + inputs.landlordPct + '"></div>' +
      '</div>' +
      '<div class="bp-modal-actions">' +
        '<button class="bp-btn-cancel" onclick="closeVarModal()">取消</button>' +
        '<button class="bp-btn-primary" id="bp-var-apply">应用并保存</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    window.closeVarModal = function() {
      var o = document.getElementById('bp-var-overlay');
      if (o) o.remove();
      varMode = false;
      document.getElementById('bp-var-btn').textContent = '编辑变量';
      document.getElementById('bp-save-btn').style.display = 'none';
      document.getElementById('bp-status').textContent = '';
    };

    document.getElementById('bp-var-apply').addEventListener('click', applyVarChanges);

    varMode = true;
    document.getElementById('bp-var-btn').textContent = '关闭变量';
    document.getElementById('bp-save-btn').style.display = 'inline-block';
    document.getElementById('bp-save-btn').textContent = '保存修改';
    document.getElementById('bp-save-btn').disabled = false;
  }

  function closeVarModal() {
    if (window.closeVarModal) window.closeVarModal();
    else {
      var o = document.getElementById('bp-var-overlay');
      if (o) o.remove();
      varMode = false;
    }
  }

  // ==================== 应用变量更改 ====================
  function applyVarChanges() {
    var model = window.BusinessModel;
    if (!model) return;

    var inputs = {
      area: Number(document.getElementById('var-area').value) || 2000,
      tableCount: Number(document.getElementById('var-tableCount').value) || 120,
      seatsPerTable: Number(document.getElementById('var-seatsPerTable').value) || 2.8,
      staffCount: Number(document.getElementById('var-staffCount').value) || 48,
      kitchenStaff: Number(document.getElementById('var-kitchenStaff').value) || 28,
      kitchenCost: Number(document.getElementById('var-kitchenCost').value) || 139000,
      frontStaff: Number(document.getElementById('var-frontStaff').value) || 20,
      frontCost: Number(document.getElementById('var-frontCost').value) || 104000,
      price: Number(document.getElementById('var-price').value) || 169,
      dailyRevenue: Number(document.getElementById('var-dailyRevenue').value) || 60000,
      foodCostPct: Number(document.getElementById('var-foodCostPct').value) || 45,
      totalInvestment: Number(document.getElementById('var-totalInvestment').value) || 800000,
      equipmentInvestment: Number(document.getElementById('var-equipmentInvestment').value) || 500000,
      paybackMonths: Number(document.getElementById('var-paybackMonths').value) || 12,
      laborCost: Number(document.getElementById('var-laborCost').value) || 243000,
      rent: Number(document.getElementById('var-rent').value) || 70000,
      utilityCost: Number(document.getElementById('var-utilityCost').value) || 48000,
      miscCost: Number(document.getElementById('var-miscCost').value) || 60000,
      staffInitialCost: Number(document.getElementById('var-staffInitialCost').value) || 200000,
      foodInitialCost: Number(document.getElementById('var-foodInitialCost').value) || 100000,
      marketingPct: Number(document.getElementById('var-marketingPct').value) || 3,
      serviceFeePct: Number(document.getElementById('var-serviceFeePct').value) || 4,
      operationPct: Number(document.getElementById('var-operationPct').value) || 4,
      investorPct: Number(document.getElementById('var-investorPct').value) || 10,
      landlordThreshold: Number(document.getElementById('var-landlordThreshold').value) || 30000,
      landlordPct: Number(document.getElementById('var-landlordPct').value) || 10,
    };

    model.setInputs(inputs);
    hasChanges = true;
    document.getElementById('bp-status').textContent = '变量已更新，点击保存';
    document.getElementById('bp-status').style.color = 'rgba(255,255,255,0.9)';

    // 自动触发保存
    saveContent();
  }

  // ==================== 收集所有可编辑内容 ====================
  function collectContent() {
    var data = {};
    var elements = document.querySelectorAll('[data-edit]');
    elements.forEach(function(el) {
      data[el.dataset.edit] = el.innerHTML;
    });
    return data;
  }

  // ==================== 简单哈希 ====================
  function simpleHash(str) {
    if (!str) return '';
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  // ==================== 计算当前 HTML 内容哈希 ====================
  function computeHtmlHash() {
    var elements = document.querySelectorAll('[data-edit]');
    var data = {};
    elements.forEach(function(el) {
      data[el.getAttribute('data-edit')] = el.innerHTML.trim();
    });
    return simpleHash(JSON.stringify(data));
  }

  // ==================== 从数据库加载内容 ====================
  async function loadContent() {
    try {
      var htmlHash = computeHtmlHash();
      var url = API_URL + '?html_hash=' + encodeURIComponent(htmlHash);
      var res = await fetch(url);
      if (!res.ok) return;
      
      var result = await res.json();
      
      // 核心判断：source 字段决定内容来源
      // source='db' → 哈希匹配 → 数据库有用户编辑 → 用数据库内容覆盖页面
      // source='html' → 哈希不匹配 → 代码最新 → 保留 HTML，后台同步到数据库
      if (result.source === 'db' && result.content && typeof result.content === 'object') {
        // 数据库有用户编辑的内容，应用到页面
        applyContent(result.content);
        // 应用数据库的模型变量（用户在前台编辑过变量）
        if (result.model && typeof result.model === 'object') {
          var dbModel = window.BusinessModel;
          if (dbModel) {
            dbModel.setInputs(result.model);
          }
        }
      } else if (result.source === 'html' && result.sync_needed) {
        // 代码最新，后台同步 HTML 到数据库
        syncHtmlToDb();
      }
      // source 字段不存在（旧版 API）→ 不处理，保留 HTML 内容
    } catch (e) {
      // 静默处理
    }
  }

  // ==================== 应用内容到页面 ====================
  function applyContent(data) {
    if (!data || typeof data !== 'object') return;
    var keys = Object.keys(data);
    // 安全检查：所有值都为空时不覆盖
    var hasContent = false;
    for (var i = 0; i < keys.length; i++) {
      if (data[keys[i]] && data[keys[i]].trim()) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) return;
    keys.forEach(function(key) {
      var el = document.querySelector('[data-edit="' + key + '"]');
      if (el && data[key]) {
        el.innerHTML = data[key];
      }
    });
  }

  // ==================== 后台同步 HTML 到数据库 ====================
  async function syncHtmlToDb() {
    try {
      var content = collectContent();
      var keys = Object.keys(content);
      var hasContent = false;
      for (var i = 0; i < keys.length; i++) {
        if (content[keys[i]] && content[keys[i]].trim()) {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) return;
      
      var htmlHash = computeHtmlHash();
      var model = window.BusinessModel ? window.BusinessModel.getInputs() : null;
      await fetch(API_URL + '/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content, html_hash: htmlHash, model: model })
      });
    } catch (e) {
      // 静默处理
    }
  }

  // ==================== 保存内容到数据库 ====================
  async function saveContent() {
    var content = collectContent();
    var htmlHash = computeHtmlHash();
    var saveBtn = document.getElementById('bp-save-btn');
    var status = document.getElementById('bp-status');

    // 收集模型变量
    var modelInputs = null;
    var bm = window.BusinessModel;
    if (bm) {
      modelInputs = bm.getInputs();
    }

    var keys = Object.keys(content);
    if (keys.length === 0 && !modelInputs) {
      status.textContent = '保存失败：未找到可编辑内容';
      status.style.color = '#e74c3c';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    status.textContent = '';

    try {
      var body = { content: content, html_hash: htmlHash };
      if (modelInputs) {
        body.model = modelInputs;
      }

      var res = await fetch(API_URL + '/save-and-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        var result = await res.json();
        hasChanges = false;
        if (result.github && !result.github.synced) {
          status.textContent = '保存成功，但 GitHub 同步失败';
          status.style.color = '#e67e22';
        } else {
          status.textContent = '保存成功！已同步到数据库';
          status.style.color = '#27ae60';
        }
        if (varMode) {
          closeVarModal();
        }
      } else {
        status.textContent = '保存失败，请重试';
        status.style.color = '#e74c3c';
      }
    } catch (e) {
      status.textContent = '保存失败：网络错误';
      status.style.color = '#e74c3c';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存修改';
      setTimeout(function() {
        status.textContent = '';
      }, 3000);
    }
  }

  // ==================== 初始化 ====================
  function init() {
    createToolbar();

    // 第一步：渲染 BusinessModel（从代码计算）
    var model = window.BusinessModel;
    if (model) {
      model.render();
    }

    // 第二步：从数据库加载（检查是否有用户编辑）
    loadContent();

    // 监听编辑变化
    document.addEventListener('input', function(e) {
      if (e.target.closest && e.target.closest('[data-edit]')) {
        if (!hasChanges && editMode) {
          hasChanges = true;
          document.getElementById('bp-status').textContent = '已修改，点击保存';
        }
      }
    });

    // 页面从缓存恢复时重新加载
    window.addEventListener('pageshow', function(e) {
      if (e.persisted) {
        loadContent();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();