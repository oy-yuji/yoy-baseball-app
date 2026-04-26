(function initThemeEarly() {
  try {
    var theme = window.localStorage.getItem('yoy_theme') === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);

    if (theme === 'dark') {
      var style = document.createElement('style');
      style.id = 'yoy-theme-prepaint';
      style.textContent = "html[data-theme='dark'], html[data-theme='dark'] body, html[data-theme='dark'] .bg-light { background-color: #0f172a !important; color: #e2e8f0 !important; }";
      document.head.appendChild(style);
    }
  } catch (e) {
    // Keep default light rendering if storage is unavailable.
  }
})();
