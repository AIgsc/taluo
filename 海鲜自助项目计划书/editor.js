/**
 * 海鲜自助项目计划书 - 在线编辑功能
 * 支持所有文字内容点击编辑，保存到本地 JSON 文件
 * 运行 sync-html.js 将编辑内容写入 HTML 文件
 */

(function() {
  'use strict';

  // 本地保存服务器地址（修改为你的实际地址）
  const SAVE_URL = window.BP_SAVE_URL || 'http://localhost:3456';
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
        'z-index:9999;background:#1a5276;color:#fff;padding:12px 24px;' +
        'border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);' +
        'display:flex;align-items:center;gap:12px;font-size:14px;' +
        'transition:opacity 0.3s;' +
        'touch-action:manipulation;' +
      '}' +
      '#bp-toolbar .bp-btn{' +
        'border:none;padding:10px 20px;border-radius:8px;cursor:pointer;' +
        'font-size:15px;font-weight:600;transition:all 0.2s;' +
        'touch-action:manipulation;' +
        '-webkit-tap-highlight-color:rgba(255,255,255,0.2);' +
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
        'user-select:text !important;' +
        '-webkit-user-select:text !important;' +
        '-webkit-touch-callout:default !important;' +
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

  // ==================== 保存内容到本地 JSON 文件 ====================
  async function saveContent() {
    var content = collectContent();
    var saveBtn = document.getElementById('bp-save-btn');
    var status = document.getElementById('bp-status');

    // 调试：打印收集到的 keys
    var keys = Object.keys(content);
    console.log('准备保存，区块数:', keys.length, 'keys:', keys.join(', '));

    if (keys.length === 0) {
      status.textContent = '保存失败：未找到可编辑内容';
      status.style.color = '#e74c3c';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    status.textContent = '';

    try {
      var res = await fetch(SAVE_URL + '/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
      });

      if (res.ok) {
        hasChanges = false;
        status.textContent = '保存成功！运行 sync-html.js 同步到 HTML';
        status.style.color = '#27ae60';
        console.log('保存成功');
      } else {
        var errText = await res.text();
        console.error('保存失败，状态码:', res.status, '响应:', errText);
        status.textContent = '保存失败，请重试';
        status.style.color = '#e74c3c';
      }
    } catch (e) {
      console.error('保存网络错误:', e);
      status.textContent = '保存失败：请先启动 save-server.js';
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
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();