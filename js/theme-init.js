(function initThemeEarly() {
  try {
    var storedTheme = window.localStorage.getItem('yoy_theme');
    var theme = storedTheme === 'light' ? 'light' : 'dark';
    if (!storedTheme) {
      window.localStorage.setItem('yoy_theme', theme);
    }
    document.documentElement.setAttribute('data-theme', theme);

    if (theme === 'dark') {
      var style = document.createElement('style');
      style.id = 'yoy-theme-prepaint';
      style.textContent = "html[data-theme='dark'], html[data-theme='dark'] body, html[data-theme='dark'] .bg-light { background-color: #0f172a !important; color: #e2e8f0 !important; }";
      document.head.appendChild(style);
    }
  } catch (e) {
    // Keep rendering resilient even if storage is unavailable.
  }
})();
