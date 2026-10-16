/* ============================================================
   技术日报静态页 · 主题开关（与主站同一套深棕黑 / 暖白）
   - localStorage key: theme（与主站同源共享，主站与日报互相同步）
   - 默认跟随系统 prefers-color-scheme；手动选择后记住
   - 各页面 <head> 内联防闪烁脚本负责提前设置 data-theme；
     本文件负责：注入按钮样式、注入开关按钮、绑定切换、跟随系统
   ============================================================ */
(function () {
  var KEY = 'theme';
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncMeta(dark) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    var bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    meta.setAttribute('content', bg || (dark ? '#262220' : '#F9F7F4'));
  }

  function apply(theme, persist) {
    var dark = theme === 'dark';
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (persist) {
      try { localStorage.setItem(KEY, theme); } catch (e) {}
    }
    var btn = document.getElementById('digest-theme-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', String(dark));
      var label = dark ? '切换到浅色模式' : '切换到深色模式';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
    syncMeta(dark);
  }

  /* ---- 注入按钮样式（随组件自包含，颜色用各页 CSS 变量，深色自动跟随） ---- */
  var css =
    '.dt-toggle{display:inline-flex;align-items:center;justify-content:center;' +
    'width:34px;height:34px;border:1px solid var(--border);background:var(--bg-elevated);' +
    'border-radius:50%;color:var(--text-secondary);cursor:pointer;padding:0;flex:0 0 auto;' +
    'margin-left:2px;vertical-align:middle;' +
    'transition:color .18s,border-color .18s,background-color .18s,transform .18s;}' +
    '.dt-toggle:hover{color:var(--accent);border-color:var(--accent);}' +
    '.dt-toggle:active{transform:scale(.92);}' +
    '.dt-toggle svg{width:16px;height:16px;display:block;}' +
    '.dt-toggle .dt-sun{display:none;}' +
    '.dt-toggle .dt-moon{display:block;}' +
    '[data-theme="dark"] .dt-toggle .dt-sun{display:block;}' +
    '[data-theme="dark"] .dt-toggle .dt-moon{display:none;}' +
    /* 仅引 janus.css 的正文页未定义 nav-links 布局，这里兜底为右侧横向排列 */
    '.nav .nav-links{display:inline-flex;align-items:center;gap:18px;}' +
    'header nav{display:flex;align-items:center;gap:14px;}';
  var style = document.createElement('style');
  style.setAttribute('data-dt-style', '');
  style.textContent = css;
  document.head.appendChild(style);

  var ICON_MOON =
    '<svg class="dt-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var ICON_SUN =
    '<svg class="dt-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2' +
    'M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

  function makeButton() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'dt-toggle';
    b.id = 'digest-theme-toggle';
    b.innerHTML = ICON_MOON + ICON_SUN;
    b.addEventListener('click', function () {
      apply(current() === 'dark' ? 'light' : 'dark', true);
    });
    return b;
  }

  function mount() {
    var btn = makeButton();
    var host =
      document.querySelector('.nav .nav-links') ||   // janus 归档首页（右侧链接组）
      document.querySelector('.nav-inner') ||        // janus 日报正文页（内层 flex 容器，space-between 推到右侧）
      document.querySelector('header nav') ||        // digest / digest-v3 旧版页
      document.querySelector('nav');                 // 兜底
    if (host) host.appendChild(btn);
    apply(current(), false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  /* 系统主题变化：仅在用户未手动选择时跟随 */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    var s = stored();
    if (!s || s === 'auto') apply(e.matches ? 'dark' : 'light', false);
  });

  /* 跨标签页同步（主站切换后，已打开的日报标签也跟随） */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
      apply(e.newValue, false);
    }
  });
})();
