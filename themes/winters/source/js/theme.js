(() => {
  const nav = document.getElementById('site-nav-bar');
  const menuButton = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  let logoMeasured = false;

  // ---------- 主题切换（深棕黑 / 暖白）----------
  const THEME_KEY = 'theme';
  const LIGHT_BG = '#F9F7F4';
  const DARK_BG = '#262220';
  const root = document.documentElement;
  const themeToggle = document.querySelector('[data-theme-toggle]');

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(theme, persist) {
    const dark = theme === 'dark';
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    }
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.setAttribute('content', dark ? DARK_BG : LIGHT_BG);
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', String(dark));
      const label = dark ? '切换到浅色模式' : '切换到深色模式';
      themeToggle.setAttribute('aria-label', label);
      themeToggle.title = label;
    }
  }
  themeToggle?.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  });
  // 系统主题变化：仅在用户未手动选择时跟随
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (err) {}
    if (!stored || stored === 'auto') applyTheme(e.matches ? 'dark' : 'light', false);
  });
  applyTheme(currentTheme(), false);

  // Logo 收缩：滚动后隐藏后半段，首次滚动时才测量宽度（等字体就绪）
  function measureLogo() {
    if (logoMeasured) return;
    document.querySelectorAll('.nav-logo .ch').forEach((el) => {
      el.style.width = el.offsetWidth + 'px';
    });
    logoMeasured = true;
  }

  function onScroll() {
    if (window.scrollY > 40) {
      measureLogo();
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // 移动端菜单
  menuButton?.addEventListener('click', () => {
    const isOpen = menu?.dataset.open === 'true';
    if (menu) menu.dataset.open = String(!isOpen);
    menuButton.setAttribute('aria-expanded', String(!isOpen));
  });

  // 滚动揭示
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.06 });

  document.querySelectorAll(
    '.hero-art-figure, .feature-card, .category-panel, .category-directory-item, .post-row, .listing-header, .article-header'
  ).forEach((el) => {
    el.classList.add('reveal');
    observer.observe(el);
  });

  // 文章页 TOC 高亮
  const tocLinks = document.querySelectorAll('.article-toc a');
  if (tocLinks.length) {
    const sections = document.querySelectorAll('.article-content h2[id], .article-content h3[id]');
    window.addEventListener('scroll', () => {
      let current = '';
      sections.forEach((s) => {
        if (s.getBoundingClientRect().top < 140) current = s.id;
      });
      tocLinks.forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + current);
      });
    }, { passive: true });
  }
})();
