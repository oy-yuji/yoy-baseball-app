(function initAppCore() {
	if (window.__yoyAppCoreInitialized) {
		return;
	}
	window.__yoyAppCoreInitialized = true;

	const THEME_KEY = 'yoy_theme';
	const THEME_STYLE_ID = 'yoy-global-theme-style';
	const THEME_TOGGLE_ID = 'themeToggleBtn';
	const roleHomePageSuffixes = [
		'/admin/panel.html',
		'/trainer/dashboard.html',
		'/athlete/dashboard.html'
	];

	function getNormalizedPathname() {
		return (window.location.pathname || '').replace(/\\/g, '/').toLowerCase();
	}

	function isRoleHomepage() {
		const path = getNormalizedPathname();
		return roleHomePageSuffixes.some((suffix) => path.endsWith(suffix));
	}

	function getStoredTheme() {
		return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
	}

	function setStoredTheme(theme) {
		window.localStorage.setItem(THEME_KEY, theme === 'dark' ? 'dark' : 'light');
	}

	function applyTheme(theme) {
		document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
	}

	function injectThemeStyles() {
		if (document.getElementById(THEME_STYLE_ID)) {
			return;
		}

		const style = document.createElement('style');
		style.id = THEME_STYLE_ID;
		style.textContent = `
:root[data-theme='dark'] {
	color-scheme: dark;
}

:root[data-theme='dark'] body {
	background-color: #0f172a !important;
	color: #e2e8f0 !important;
}

:root[data-theme='dark'] .navbar.bg-secondary {
	background-color: #1e293b !important;
}

:root[data-theme='dark'] .card,
:root[data-theme='dark'] .modal-content,
:root[data-theme='dark'] .list-group-item,
:root[data-theme='dark'] .dropdown-menu {
	background-color: #111827 !important;
	color: #e2e8f0 !important;
	border-color: #334155 !important;
}

:root[data-theme='dark'] .modal-header,
:root[data-theme='dark'] .modal-footer {
	border-color: #334155 !important;
}

:root[data-theme='dark'] .btn-close {
	filter: invert(1) brightness(1.25);
}

:root[data-theme='dark'] .alert {
	border: 1px solid #334155 !important;
	color: #e2e8f0 !important;
}

:root[data-theme='dark'] .alert-info {
	background-color: #0b2f45 !important;
	border-color: #1e3a8a !important;
	color: #bfdbfe !important;
}

:root[data-theme='dark'] .alert-success {
	background-color: #052e1f !important;
	border-color: #14532d !important;
	color: #bbf7d0 !important;
}

:root[data-theme='dark'] .alert-warning {
	background-color: #3f2a06 !important;
	border-color: #7c5a10 !important;
	color: #fde68a !important;
}

:root[data-theme='dark'] .alert-danger {
	background-color: #3f1418 !important;
	border-color: #7f1d1d !important;
	color: #fecaca !important;
}

:root[data-theme='dark'] .table {
	--bs-table-bg: #111827;
	--bs-table-striped-bg: #172033;
	--bs-table-hover-bg: #1f2937;
	--bs-table-color: #e2e8f0;
	--bs-table-striped-color: #e2e8f0;
	--bs-table-hover-color: #f8fafc;
	border-color: #334155;
}

:root[data-theme='dark'] .form-control,
:root[data-theme='dark'] .form-select,
:root[data-theme='dark'] textarea,
:root[data-theme='dark'] input {
	background-color: #0b1220 !important;
	color: #e2e8f0 !important;
	border-color: #334155 !important;
}

:root[data-theme='dark'] .form-control::placeholder,
:root[data-theme='dark'] textarea::placeholder {
	color: #94a3b8 !important;
}

:root[data-theme='dark'] .btn-outline-secondary {
	color: #e2e8f0 !important;
	border-color: #64748b !important;
}

:root[data-theme='dark'] .btn-outline-secondary:hover {
	background-color: #334155 !important;
	border-color: #94a3b8 !important;
	color: #f8fafc !important;
}

:root[data-theme='dark'] .text-muted {
	color: #94a3b8 !important;
}

:root[data-theme='dark'] a:not(.btn):not(.navbar-brand) {
	color: #93c5fd;
}

.theme-toggle-btn {
	position: fixed;
	top: 66px;
	right: 14px;
	z-index: 1101;
	border: 1px solid rgba(148, 163, 184, 0.5);
	border-radius: 999px;
	padding: 0.4rem 0.8rem;
	font-size: 0.9rem;
	font-weight: 600;
	background: rgba(255, 255, 255, 0.92);
	backdrop-filter: blur(4px);
	color: #0f172a;
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	cursor: pointer;
	transition: transform 0.15s ease, box-shadow 0.15s ease;
	box-shadow: 0 4px 12px rgba(15, 23, 42, 0.15);
}

.theme-toggle-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 6px 16px rgba(15, 23, 42, 0.22);
}

:root[data-theme='dark'] .theme-toggle-btn {
	background: rgba(15, 23, 42, 0.92);
	color: #e2e8f0;
	border-color: rgba(148, 163, 184, 0.5);
}
`;

		document.head.appendChild(style);
	}

	function updateToggleLabel(btn) {
		const dark = getStoredTheme() === 'dark';
		btn.innerHTML = dark ? 'Light Mode' : 'Dark Mode';
	}

	function mountThemeToggle() {
		if (!isRoleHomepage() || document.getElementById(THEME_TOGGLE_ID)) {
			return;
		}

		const button = document.createElement('button');
		button.id = THEME_TOGGLE_ID;
		button.type = 'button';
		button.className = 'theme-toggle-btn';
		updateToggleLabel(button);
		button.addEventListener('click', function () {
			const next = getStoredTheme() === 'dark' ? 'light' : 'dark';
			setStoredTheme(next);
			applyTheme(next);
			updateToggleLabel(button);
		});
		document.body.appendChild(button);
	}

	injectThemeStyles();
	applyTheme(getStoredTheme());

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', mountThemeToggle);
	} else {
		mountThemeToggle();
	}

	// Initialize Supabase client
	const SUPABASE_URL = 'https://vgaxwdipyghoxdtqkfrl.supabase.co';
	const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnYXh3ZGlweWdob3hkdHFrZnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDIzMDAsImV4cCI6MjA4NzA3ODMwMH0.adg6WQsb_XoFDs8VfYuaHSXShAm-fgA4-1ZonzmVZuw';

	if (window.supabase && !window.sb) {
		// Create the client using a different variable name to avoid conflict with the CDN global
		window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
	}

	// Connectivity check
	if (window.sb) {
		window.addEventListener('DOMContentLoaded', async () => {
			try {
				const { data, error } = await sb.auth.getUser();
				if (error) {
					console.error('Supabase connection error:', error.message);
				} else {
					console.log('Supabase connection successful. User:', data.user);
				}
			} catch (err) {
				console.error('Supabase connection failed:', err);
			}
		});
	}
})();
