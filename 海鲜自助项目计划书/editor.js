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
      // 无封面容器时，工具栏追加到 body 顶部。
      // 此时 absolute 定位相对视口会落在页面顶部，容易被固定的顶部导航栏遮挡，
      // 因此改用 fixed 定位并放到导航栏下方、提高 z-index，保证始终可见可点。
      document.body.insertBefore(bar, document.body.firstChild);
      bar.style.position = 'fixed';
      bar.style.top = '52px';
      bar.style.right = '16px';
      bar.style.zIndex = '1000';
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

  // ==================== 保存内容到 GitHub（直接推送完整 HTML） ====================
  async function saveContent() {
    var saveBtn = document.getElementById('bp-save-btn');
    var status = document.getElementById('bp-status');

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

    var saveData = {
      version: 1,
      inputs: inputs,
      practicalData: practicalData,
      customBlocks: customBlocks
    };
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
    // 清理可能重复创建的按钮，防止堆积多个
    var existing = document.querySelectorAll('#bp-push-btn');
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].parentNode) existing[i].parentNode.removeChild(existing[i]);
    }
    var btn = document.createElement('div');
    btn.id = 'bp-push-btn';
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
    document.body.appendChild(btn);
  }
  window.bpShowPushButton = createPushButton;

  // ==================== 初始化 ====================
  function init() {
    // 仅当页面存在 data-edit 元素时才创建编辑工具栏（纯利计算器等页面有自己的编辑机制）
    var hasEditableText = document.querySelector('[data-edit]');
    if (hasEditableText) {
      createToolbar();

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