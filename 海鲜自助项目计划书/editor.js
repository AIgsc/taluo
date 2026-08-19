/**
 * 海鲜自助项目计划书 - 在线编辑功能
 * 支持所有文字内容点击编辑，自动保存到后端数据库
 * 首次访问自动建表，后续不再重复创建
 */

(function() {
  'use strict';

  // API 地址，可通过全局变量 BP_API_URL 自定义
  // 默认指向独立服务器 http://localhost:3001
  const API_URL = window.BP_API_URL || 'http://localhost:3001/api/business-plan';
  let editMode = false;
  let hasChanges = false;

  // ==================== 创建浮动工具栏 ====================
  function createToolbar() {
    const bar = document.createElement('div');
    bar.id = 'bp-toolbar';
    bar.innerHTML =
      '<button id="bp-edit-btn" class="bp-btn bp-btn-edit">编辑文字</button>' +
      '<button id="bp-save-btn" class="bp-btn bp-btn-save" style="display:none">保存修改</button>' +
      '<span id="bp-status" class="bp-status"></span>';

    // 工具栏样式
    const style = document.createElement('style');
    style.textContent =
      '#bp-toolbar{' +
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
        'z-index:9999;background:#1a5276;color:#fff;padding:10px 20px;' +
        'border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);' +
        'display:flex;align-items:center;gap:12px;font-size:14px;' +
        'transition:opacity 0.3s;' +
      '}' +
      '#bp-toolbar .bp-btn{' +
        'border:none;padding:6px 16px;border-radius:6px;cursor:pointer;' +
        'font-size:13px;font-weight:600;transition:all 0.2s;' +
      '}' +
      '#bp-toolbar .bp-btn-edit{background:#5dade2;color:#fff;}' +
      '#bp-toolbar .bp-btn-edit:hover{background:#2e86c1;}' +
      '#bp-toolbar .bp-btn-save{background:#27ae60;color:#fff;}' +
      '#bp-toolbar .bp-btn-save:hover{background:#1e8449;}' +
      '#bp-toolbar .bp-status{font-size:12px;color:rgba(255,255,255,0.7);}' +
      '.bp-editing{' +
        'outline:2px dashed #5dade2 !important;' +
        'outline-offset:2px !important;' +
        'border-radius:4px !important;' +
        'cursor:text !important;' +
      '}' +
      '.bp-editing:hover{background:rgba(93,173,226,0.05) !important;}' +
      '.bp-saving{opacity:0.5;pointer-events:none;}';

    document.head.appendChild(style);
    document.body.appendChild(bar);

    document.getElementById('bp-edit-btn').addEventListener('click', toggleEdit);
    document.getElementById('bp-save-btn').addEventListener('click', saveContent);
  }

  // ==================== 切换编辑模式 ====================
  function toggleEdit() {
    editMode = !editMode;
    const elements = document.querySelectorAll('[data-edit]');
    elements.forEach(function(el) {
      el.contentEditable = editMode;
      el.classList.toggle('bp-editing', editMode);
    });

    document.getElementById('bp-edit-btn').textContent = editMode ? '完成编辑' : '编辑文字';
    document.getElementById('bp-save-btn').style.display = editMode ? 'inline-block' : 'none';

    if (!editMode) {
      document.getElementById('bp-status').textContent = '';
    }
  }

  // ==================== 标记内容已修改 ====================
  function markModified() {
    if (!editMode) return;
    if (!hasChanges) {
      hasChanges = true;
      document.getElementById('bp-status').textContent = '已修改，点击保存';
    }
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

  // ==================== 应用保存的内容到页面 ====================
  function applyContent(data) {
    Object.keys(data).forEach(function(key) {
      var el = document.querySelector('[data-edit="' + key + '"]');
      if (el) {
        el.innerHTML = data[key];
      }
    });
  }

  // ==================== 从后端加载内容 ====================
  async function loadContent() {
    try {
      var res = await fetch(API_URL);
      if (res.ok) {
        var result = await res.json();
        if (result.content && typeof result.content === 'object') {
          applyContent(result.content);
          console.log('商业计划书：已加载保存的编辑内容');
        }
      }
    } catch (e) {
      console.log('商业计划书：首次加载，使用默认内容');
    }
  }

  // ==================== 保存内容到后端 ====================
  async function saveContent() {
    var content = collectContent();
    var saveBtn = document.getElementById('bp-save-btn');
    var status = document.getElementById('bp-status');

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    status.textContent = '';

    try {
      var res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
      });

      if (res.ok) {
        hasChanges = false;
        status.textContent = '保存成功';
        status.style.color = '#27ae60';
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

    // 监听输入事件，标记修改
    document.addEventListener('input', function(e) {
      if (e.target.closest && e.target.closest('[data-edit]')) {
        markModified();
      }
    });

    // 从后端加载已保存的内容
    loadContent();
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();