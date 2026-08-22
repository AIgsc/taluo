const fs = require('fs');
const dir = '/workspace/海鲜自助项目计划书';

function clean(file, stripEditState) {
  let s = fs.readFileSync(file, 'utf8');
  const orig = s.length;

  // 1. 移除残留的推送按钮（baked-in <div id="bp-push-btn">...</div>，紧跟在 bpShowPushButton 脚本后）
  s = s.replace(
    /<script>if \(window\.bpShowPushButton\)[^<]*<\/script><div id="bp-push-btn"[^>]*>.*?<\/div>/s,
    '<script>if (window.bpShowPushButton) window.bpShowPushButton();</script>'
  );

  // 2. 移除残留的编辑工具栏（baked-in <div id="bp-toolbar">...</div>）
  s = s.replace(/<div id="bp-toolbar"[^>]*>(?:(?!<\/div>).)*<\/div>/s, '');

  // 2.5 移除 baked-in 的工具栏样式块 <style>#bp-toolbar{...}</style>
  //     （这些样式 editor.js 运行时会注入，静态副本是冗余垃圾）
  s = s.replace(/<style>#bp-toolbar[\s\S]*?<\/style>/g, '');

  // 3. 移除 </body> 之后的浏览器扩展垃圾代码
  const idx = s.lastIndexOf('</body>');
  if (idx !== -1) {
    s = s.slice(0, idx).replace(/\s+$/, '') + '\n</body>\n</html>\n';
  }

  // 4. 剥离残留的编辑态标记（仅分账；纯利计算器的 contenteditable 是数据字段设计，保留）
  if (stripEditState) {
    s = s.replace(/ bp-editing/g, '')
         .replace(/ class="bp-editing"/g, '')
         .replace(/class="bp-editing"/g, '')
         .replace(/ contenteditable="true"/g, '')
         .replace(/ class=""/g, '')
         .replace(/class="([^"]*?) "/g, 'class="$1"')
         .replace(/" >/g, '">');
  }

  fs.writeFileSync(file, s);
  console.log(file.split('/').pop(), 'cleaned:', orig, '->', s.length, 'bytes');
}

clean(dir + '/分账与财务管理制度.html', true);
clean(dir + '/纯利计算器.html', false);
clean(dir + '/招商计划书.html', false);
