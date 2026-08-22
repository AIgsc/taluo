/**
 * 海鲜自助项目计划书 - 在线编辑功能 v6
 * 纯前端编辑 + GitHub 直推（无数据库）
 * 
 * 核心逻辑：
 * 1. 正常模式：数据填空（data-model 输入变量）可直接编辑，改完自动重算+保存
 * 2. 编辑文字模式：仅 data-edit 文字可编辑，data-model 禁止修改
 * 3. 保存时推送完整 HTML 到 GitHub → Vercel 自动部署
 * 4. 变量值嵌入 HTML（#bp-saved-vars），刷新后 BusinessModel 读取
 */

(function() {
  'use strict';

  var API_URL = window.BP_API_URL || '/api/business-plan';
  var editMode = false;
  var hasChanges = false;
  var dataModelSaveTimer = null;

  // ==================== 创建浮动工具栏 ====================
  function createToolbar() {
    // 清理可能残留的旧工具栏（推送后的 HTML 里可能已含一个 #bp-toolbar），
    // 否则会出现两个同 id 的工具栏，按钮监听绑定错乱、点击失效
    var oldToolbars = document.querySelectorAll('#bp-toolbar');
    for (var i = 0; i < oldToolbars.length; i++) {
      if (oldToolbars[i].parentNode) oldToolbars[i].parentNode.removeChild(oldToolbars[i]);
    }

    var bar = document.createElement('div');
    bar.id = 'bp-toolbar';
    bar.innerHTML =
      '<button id="bp-edit-btn" class="bp-btn bp-btn-edit">编辑文字</button>' +
      '<button id="bp-save-btn" class="bp-btn bp-btn-save" style="display:none">保存修改</button>' +
      '<span id="bp-status" class="bp-status"></span>';

    var style = document.createElement('style');
    style.textContent =
      '#bp-toolbar{' +
        'position:absolute;top:12px;right:16px;z-index:999;' +
        'display:flex;align-items:center;gap:8px;font-size:14px;' +
        'transition:opacity 0.3s;touch-action:manipulation;' +
      '}' +
      '#bp-toolbar .bp-btn{' +
        'border:none;padding:6px 14px;border-radius:6px;cursor:pointer;' +
        'font-size:13px;font-weight:600;transition:all 0.2s;' +
        'touch-action:manipulation;-webkit-tap-highlight-color:rgba(255,255,255,0.2);' +
        'user-select:none;-webkit-user-select:none;' +
      '}' +
      '#bp-toolbar .bp-btn-edit{background:rgba(93,173,226,0.85);color:#fff;}' +
      '#bp-toolbar .bp-btn-edit:hover{background:#2e86c1;}' +
      '#bp-toolbar .bp-btn-save{background:#27ae60;color:#fff;}' +
      '#bp-toolbar .bp-btn-save:hover{background:#1e8449;}' +
      '#bp-toolbar .bp-status{font-size:11px;color:rgba(255,255,255,0.7);margin-left:4px;}' +
      '.bp-editing{outline:2px dashed #5dade2 !important;outline-offset:2px !important;border-radius:4px !important;cursor:text !important;user-select:text !important;-webkit-user-select:text !important;-webkit-touch-callout:default !important;color:#1a1a2e !important;caret-color:#1a1a2e !important;}' +
      '.cover.bp-editing, .cover.bp-editing h1, .cover.bp-editing .subtitle, .cover.bp-editing .info, .cover.bp-editing .info strong, .cover.bp-editing .badge, .cover.bp-editing .version, .cover.bp-editing .divider{color:#1a1a2e !important;caret-color:#1a1a2e !important;}.cover.bp-editing .divider{background:rgba(0,0,0,0.2) !important;}.cover.bp-editing h1{text-shadow:none !important;}' +
      '.bp-editing:hover{background:rgba(93,173,226,0.05) !important;}' +
      '.bp-saving{opacity:0.5;pointer-events:none;}' +
      /* 数据填空可编辑样式 */
      '.bp-data-editable{' +
        'cursor:pointer !important;' +
        'border-bottom:1px dashed #5dade2 !important;' +
        'transition:border-color 0.2s,background 0.2s;' +
        'border-radius:2px !important;' +
      '}' +
      '.bp-data-editable:hover{' +
        'background:rgba(93,173,226,0.08) !important;' +
        'border-bottom-color:#2e86c1 !important;' +
      '}' +
      '.bp-data-editable:focus{' +
        'outline:2px solid #5dade2 !important;' +
        'background:#fff !important;' +
        'color:#1a5276 !important;' +
        'border-radius:3px !important;' +
        'padding:0 2px !important;' +
      '}' +
      /* 编辑文字模式下，数据填空禁止编辑 */
      '.bp-data-locked{' +
        'cursor:default !important;' +
        'border-bottom:1px dashed #ccc !important;' +
        'pointer-events:none !important;' +
        'opacity:0.85 !important;' +
      '}' +
      '.bp-data-locked:hover{' +
        'background:transparent !important;' +
        'border-bottom-color:#ccc !important;' +
      '}';

    document.head.appendChild(style);
    var cover = document.getElementById('page-cover');
    if (cover) {
      cover.appendChild(bar);
    } else {
      // 无封面容器时：把工具栏放进文档流，放在页面第一个 h1 上方，
      // 不悬浮、不固定，避免被顶部导航栏遮挡、也避免按钮状态错乱
      var firstH1 = document.querySelector('h1');
      if (firstH1) {
        firstH1.parentNode.insertBefore(bar, firstH1);
      } else {
        document.body.insertBefore(bar, document.body.firstChild);
      }
      bar.style.position = 'static';
      bar.style.top = 'auto';
      bar.style.right = 'auto';
      bar.style.zIndex = 'auto';
      bar.style.marginBottom = '8px';
      bar.style.justifyContent = 'flex-end';
    }

    document.getElementById('bp-edit-btn').addEventListener('click', toggleEdit);
    document.getElementById('bp-save-btn').addEventListener('click', saveContent);

    // 确保工具栏不被继承 contentEditable
    bar.contentEditable = false;
    var btns = bar.querySelectorAll('button');
    btns.forEach(function(b) { b.contentEditable = false; });

    // 阻止 mousedown 冒泡到父级可编辑元素（防止按钮被意外编辑）
    bar.addEventListener('mousedown', function(e) {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        e.stopPropagation();
      }
    });
  }

  // ==================== 切换编辑文字模式 ====================
  function toggleEdit() {
    editMode = !editMode;

    // 切换文字可编辑状态
    var elements = document.querySelectorAll('[data-edit]');
    elements.forEach(function(el) {
      el.contentEditable = editMode;
      el.classList.toggle('bp-editing', editMode);
    });

    // 编辑文字模式下，数据填空禁止编辑
    var dataEls = document.querySelectorAll('[data-model]');
    dataEls.forEach(function(el) {
      if (editMode) {
        el.contentEditable = false;
        el.classList.remove('bp-data-editable');
        el.classList.add('bp-data-locked');
      } else {
        el.classList.remove('bp-data-locked');
        // 重新启用可编辑（仅对输入变量）
        enableDataModelField(el);
      }
    });

    // 防止工具栏按钮继承 contentEditable
    var toolbar = document.getElementById('bp-toolbar');
    if (toolbar) {
      toolbar.contentEditable = false;
      var btns = toolbar.querySelectorAll('button');
      btns.forEach(function(b) { b.contentEditable = false; });
    }

    document.getElementById('bp-edit-btn').textContent = editMode ? '完成编辑' : '编辑文字';
    document.getElementById('bp-save-btn').style.display = editMode ? 'inline-block' : 'none';

    if (!editMode) {
      document.getElementById('bp-status').textContent = '';
    }
  }

  // ==================== 数据填空：启用字段可编辑 ====================
  function enableDataModelField(el) {
    if (editMode) return; // 编辑文字模式下不启用
    var bm = window.BusinessModel;
    if (!bm) return;
    var inputKey = bm.getInputKey(el.dataset.model);
    if (!inputKey) return;

    el.contentEditable = true;
    el.classList.add('bp-data-editable');
    el.setAttribute('inputmode', 'decimal');

    // 移除旧监听器（用新监听器替换）
    var newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    newEl.contentEditable = true;
    newEl.classList.add('bp-data-editable');
    newEl.setAttribute('inputmode', 'decimal');

    // 聚焦时：显示原始数值（去掉格式化单位）
    newEl.addEventListener('focus', function() {
      var raw = bm.inputs[inputKey];
      if (raw !== undefined) {
        this.textContent = raw;
      }
    });

    // 失焦时：解析数值，更新模型，重算
    newEl.addEventListener('blur', function() {
      var text = this.textContent.trim();
      var num = parseFloat(text.replace(/[^0-9.\-]/g, ''));
      if (!isNaN(num) && num !== bm.inputs[inputKey]) {
        var update = {};
        update[inputKey] = num;
        bm.setInputs(update);
        hasChanges = true;

        // 自动保存（防抖 2 秒）
        if (dataModelSaveTimer) clearTimeout(dataModelSaveTimer);
        dataModelSaveTimer = setTimeout(function() {
          saveContent();
        }, 2000);
      } else {
        // 未修改，重新渲染格式化值
        bm.render();
      }
    });

    // 回车确认
    newEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
      }
    });
  }

  // ==================== 启用所有数据填空 ====================
  function enableAllDataModelEditing() {
    if (editMode) return;
    var bm = window.BusinessModel;
    if (!bm) return;
    var els = document.querySelectorAll('[data-model]');
    els.forEach(function(el) {
      enableDataModelField(el);
    });
  }

  // ==================== 复位编辑状态 ====================
  // 推送前把 DOM 恢复为"正常阅读"状态，避免把 contenteditable="true" / bp-editing
  // 等编辑态写进线上 HTML，否则推上去的页面按钮/文字状态错乱、按钮点击失效
  function resetEditState() {
    editMode = false;
    var els = document.querySelectorAll('[data-edit]');
    els.forEach(function(el) {
      el.contentEditable = false;
      el.classList.remove('bp-editing');
    });
    // 数据填空恢复正常可编辑（编辑文字模式下是锁定状态）
    enableAllDataModelEditing();
    var editBtn = document.getElementById('bp-edit-btn');
    if (editBtn) editBtn.textContent = '编辑文字';
    var saveBtn = document.getElementById('bp-save-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    var status = document.getElementById('bp-status');
    if (status) status.textContent = '';
  }

  // ==================== 保存内容到 GitHub（直接推送完整 HTML） ====================
  async function saveContent() {
    var saveBtn = document.getElementById('bp-save-btn');
    var status = document.getElementById('bp-status');

    // 0. 推送前复位编辑状态：保证推上去的是"正常阅读"状态的页面，
    //    编辑状态 / 完成编辑状态点击保存，按钮都应正常工作
    resetEditState();

    // 0.5 复位推送按钮：点击推送时按钮会先变成"推送中..."，该中间状态
    //     绝不能写进线上 HTML，否则推上去的页面会多出一个卡在"推送中..."的残留按钮
    var pushBtn = document.getElementById('bp-push-btn');
    if (pushBtn) {
      pushBtn.innerHTML = '📤 推送';
      pushBtn.style.background = '#2e86c1';
      pushBtn.style.boxShadow = '0 4px 16px rgba(46,134,193,0.35)';
      pushBtn.style.pointerEvents = 'auto';
      pushBtn.style.opacity = '1';
    }

    // 1. 将当前变量值嵌入 HTML（持久化，下次加载时读取）
    var savedVars = document.getElementById('bp-saved-vars');
    var existingData = {};
    if (savedVars) {
      try { existingData = JSON.parse(savedVars.textContent); } catch(e) {}
    }

    var bm = window.BusinessModel;
    var inputs = bm ? bm.getInputs() : (existingData.inputs || {});
    var practicalData = existingData.practicalData || [];
    var customBlocks = existingData.customBlocks || [];
    if (window.PD) {
      if (window.PD.items) practicalData = window.PD.items;
      if (window.PD.customBlocks) customBlocks = window.PD.customBlocks;
    }
    // 纯利计算器数据：优先取当前运行时数据（用户修改后的实时值），
    // 不要用 HTML 里的旧数据，否则用户修改推不上去
    var calculatorData = (window.CALC && window.CALC.data) || existingData.calculatorData;

    // 保留页面自身保存的其他数据（如待办页的 todoData），只覆盖已知字段。
    // 否则推送时会把页面自己保存的数据丢弃，导致刷新后状态丢失
    var saveData = {};
    Object.keys(existingData).forEach(function(k) { saveData[k] = existingData[k]; });
    saveData.version = 1;
    saveData.inputs = inputs;
    saveData.practicalData = practicalData;
    saveData.customBlocks = customBlocks;
    if (calculatorData !== undefined) saveData.calculatorData = calculatorData;

    if (savedVars) {
      savedVars.textContent = JSON.stringify(saveData);
    } else {
      var script = document.createElement('script');
      script.id = 'bp-saved-vars';
      script.type = 'application/json';
      script.textContent = JSON.stringify(saveData);
      document.body.appendChild(script);
    }

    // 2. 获取完整 HTML
    var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    // 自动识别当前页面在 GitHub 上的文件路径
    // 注意：window.location.pathname 一定存在（打开页面必有路径），
    // 不设置默认值，避免把内容推错文件
    var pagePath = window.location.pathname.replace(/^\//, '');
    if (!pagePath || pagePath === '') {
      if (status) { status.textContent = '保存失败：无法识别当前页面路径'; status.style.color = '#e74c3c'; }
      return { ok: false, error: 'no_path' };
    }

    if (saveBtn) saveBtn.disabled = true;
    if (saveBtn) saveBtn.textContent = '保存中...';
    if (status) status.textContent = '';

    try {
      var res = await fetch(API_URL + '/save-and-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: html, filePath: pagePath })
      });

      if (res.ok) {
        var result = await res.json();
        hasChanges = false;
        if (result.github && !result.github.synced) {
          if (status) { status.textContent = '保存成功，但 GitHub 同步失败'; status.style.color = '#e67e22'; }
          return { ok: false, error: 'github_sync_failed', reason: result.github.reason || '未知错误' };
        } else {
          if (status) { status.textContent = '保存成功！已同步到 GitHub'; status.style.color = '#27ae60'; }
          return { ok: true };
        }
      } else {
        if (status) { status.textContent = '保存失败，请重试'; status.style.color = '#e74c3c'; }
        return { ok: false, error: 'server_error' };
      }
    } catch (e) {
      if (status) { status.textContent = '保存失败：网络错误'; status.style.color = '#e74c3c'; }
      return { ok: false, error: 'network_error', reason: e.message };
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存修改'; }
      if (status) {
        setTimeout(function() {
          status.textContent = '';
        }, 3000);
      }
    }
  }

  // 暴露 saveContent 为全局函数
  window.bpSaveContent = saveContent;

  // ==================== 统一推送按钮（右下角） ====================
  function createPushButton() {
    // 复用已存在的按钮或新建一个：保证全局永远只有一个推送按钮
    var btn = document.getElementById('bp-push-btn');
    if (!btn) {
      btn = document.createElement('div');
      btn.id = 'bp-push-btn';
      document.body.appendChild(btn);
    }
    // 一律复位为"正常待推送"状态：页面上可能存在被推送进 HTML 的残留按钮
    // （卡在"推送中..."），直接复用并重置，而不是再新建一个导致两个按钮共存
    btn.innerHTML = '📤 推送';
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;padding:10px 22px;background:#2e86c1;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(46,134,193,0.35);transition:all 0.2s;user-select:none;';
    btn.onclick = async function() {
      btn.innerHTML = '⏳ 推送中...';
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.7';
      var ret = await saveContent();
      if (ret && ret.ok) {
        btn.innerHTML = '✓ 已推送';
        btn.style.background = '#27ae60';
        btn.style.boxShadow = '0 4px 16px rgba(39,174,96,0.35)';
      } else {
        var reason = ret && ret.reason ? ret.reason : '';
        btn.innerHTML = '✗ 推送失败' + (reason ? '!' : '');
        if (reason) btn.title = reason;
        btn.style.background = '#c0392b';
        btn.style.boxShadow = '0 4px 16px rgba(192,57,43,0.35)';
        console.error('推送失败:', reason);
      }
      setTimeout(function() {
        btn.innerHTML = '📤 推送';
        btn.style.background = '#2e86c1';
        btn.style.boxShadow = '0 4px 16px rgba(46,134,193,0.35)';
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
      }, 3000);
    };
    // 兜底清理：HTML 里若还有其它同名按钮（例如历史推送残留的"推送中..."按钮），
    // 等文档解析/加载完成后一并移除，只保留当前这一个
    function removeStray() {
      var els = document.querySelectorAll('#bp-push-btn');
      for (var i = 0; i < els.length; i++) {
        if (els[i] !== btn && els[i].parentNode) els[i].parentNode.removeChild(els[i]);
      }
    }
    setTimeout(removeStray, 0);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', removeStray);
    }
    window.addEventListener('load', removeStray);
  }
  window.bpShowPushButton = createPushButton;

  // ==================== 初始化 ====================
  function init() {
    // 仅当页面存在 data-edit 元素时才创建编辑工具栏（纯利计算器等页面有自己的编辑机制）
    var hasEditableText = document.querySelector('[data-edit]');
    if (hasEditableText) {
      createToolbar();

      // 归一化页面状态：即使线上 HTML 残留编辑态（contenteditable=true / bp-editing），
      // 加载后也恢复为正常阅读状态，保证按钮可用
      resetEditState();

      // 渲染 BusinessModel（从代码计算）
      var model = window.BusinessModel;
      if (model) {
        model.render();
      }

      // 启用数据填空（正常模式下，数字可编辑）
      enableAllDataModelEditing();

      // 监听 data-edit 文字变化标记
      document.addEventListener('input', function(e) {
        if (e.target.closest && e.target.closest('[data-edit]')) {
          if (!hasChanges && editMode) {
            hasChanges = true;
            document.getElementById('bp-status').textContent = '已修改，点击保存';
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();