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
      '.bp-editing{outline:2px dashed #5dade2 !important;outline-offset:2px !important;border-radius:4px !important;cursor:text !important;user-select:text !important;-webkit-user-select:text !important;-webkit-touch-callout:default !important;color:inherit !important;caret-color:#fff !important;}' +
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
      document.body.insertBefore(bar, document.body.firstChild);
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

    // 1. 将当前变量值嵌入 HTML（持久化，下次加载时 BusinessModel 读取）
    var bm = window.BusinessModel;
    if (bm) {
      var inputs = bm.getInputs();
      var savedVars = document.getElementById('bp-saved-vars');
      if (savedVars) {
        savedVars.textContent = JSON.stringify({ version: 1, inputs: inputs });
      } else {
        var script = document.createElement('script');
        script.id = 'bp-saved-vars';
        script.type = 'application/json';
        script.textContent = JSON.stringify({ version: 1, inputs: inputs });
        document.body.appendChild(script);
      }
    }

    // 2. 获取完整 HTML
    var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    status.textContent = '';

    try {
      var res = await fetch(API_URL + '/save-and-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: html })
      });

      if (res.ok) {
        var result = await res.json();
        hasChanges = false;
        if (result.github && !result.github.synced) {
          status.textContent = '保存成功，但 GitHub 同步失败';
          status.style.color = '#e67e22';
        } else {
          status.textContent = '保存成功！已同步到 GitHub';
          status.style.color = '#27ae60';
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();