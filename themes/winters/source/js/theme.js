(() => {
  const root = document.documentElement;
  const themeButton = document.querySelector('[data-theme-toggle]');
  const menuButton = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  const storageKey = 'winters-blog-theme';

  const preferredTheme = () => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const applyTheme = (value) => {
    root.dataset.theme = value;
    if (themeButton) {
      const next = value === 'dark' ? '浅色' : '深色';
      themeButton.setAttribute('aria-label', `切换到${next}主题`);
      themeButton.setAttribute('aria-pressed', value === 'dark' ? 'true' : 'false');
    }
  };

  applyTheme(preferredTheme());

  themeButton?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem(storageKey, next);
    applyTheme(next);
  });

  menuButton?.addEventListener('click', () => {
    const isOpen = menu?.dataset.open === 'true';
    if (menu) menu.dataset.open = String(!isOpen);
    menuButton.setAttribute('aria-expanded', String(!isOpen));
  });
})();
