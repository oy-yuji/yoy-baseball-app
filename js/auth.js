// Real login handler using Supabase
document.addEventListener('DOMContentLoaded', function () {
	const form = document.getElementById('loginForm');
	const errorDiv = document.getElementById('loginError');

	async function handleRecoveryCallback() {
		if (!window.sb || !window.sb.auth || !errorDiv) return;

		const hash = window.location.hash && window.location.hash.startsWith('#')
			? window.location.hash.slice(1)
			: '';
		const hashParams = new URLSearchParams(hash);
		const flowType = hashParams.get('type');
		const accessToken = hashParams.get('access_token');
		const refreshToken = hashParams.get('refresh_token');

		if (flowType !== 'recovery' || !accessToken || !refreshToken) return;

		errorDiv.classList.remove('text-success');
		errorDiv.classList.add('text-danger');
		errorDiv.textContent = 'Password reset link detected. Enter a new password.';

		const nextPassword = window.prompt('Enter a new password (minimum 8 characters)');
		if (!nextPassword || nextPassword.length < 8) {
			errorDiv.textContent = 'Password update cancelled. Please use the reset link again.';
			return;
		}

		const { error: sessionError } = await window.sb.auth.setSession({
			access_token: accessToken,
			refresh_token: refreshToken
		});
		if (sessionError) {
			errorDiv.textContent = 'This reset link is invalid or expired. Request a new one.';
			console.error('Recovery setSession error:', sessionError);
			return;
		}

		const { error: updateError } = await window.sb.auth.updateUser({ password: nextPassword });
		if (updateError) {
			errorDiv.textContent = updateError.message || 'Could not update password.';
			console.error('Recovery updateUser error:', updateError);
			return;
		}

		errorDiv.classList.remove('text-danger');
		errorDiv.classList.add('text-success');
		errorDiv.textContent = 'Password updated. You can now log in.';
		if (form) form.reset();

		const cleanUrl = `${window.location.pathname}${window.location.search}`;
		window.history.replaceState({}, document.title, cleanUrl);
	}

	handleRecoveryCallback().catch((err) => {
		if (errorDiv) {
			errorDiv.textContent = 'Unable to process reset link. Please request a new one.';
		}
		console.error('Recovery callback handling failed:', err);
	});

	if (!form) return;
	form.addEventListener('submit', async function (e) {
		e.preventDefault();
		const email = document.getElementById('email').value;
		const password = document.getElementById('password').value;
		errorDiv.textContent = '';
		if (!email || !password) {
			errorDiv.textContent = 'Please enter both email and password.';
			return;
		}
		try {
			console.log('Attempting login with:', email);
			const { data, error } = await sb.auth.signInWithPassword({ email, password });
			console.log('Supabase response:', { data, error });
			if (error) {
				errorDiv.textContent = error.message;
				console.error('Login error:', error);
			} else {
				// Log session and user info
				sb.auth.getSession().then(({ data }) => {
					console.log('Session info:', data.session);
				});
				const user = data.user;
				console.log('Logged in user:', user);
				const role = user && user.user_metadata && user.user_metadata.role;
				console.log('User role:', role);
				if (role === 'athlete') {
					window.location.href = 'athlete/dashboard.html';
				} else if (role === 'trainer') {
					window.location.href = 'trainer/dashboard.html';
				} else if (role === 'admin') {
					window.location.href = 'admin/panel.html';
				} else {
					errorDiv.textContent = 'No valid role found for this user.';
					console.warn('No valid role found for user:', user);
				}
			}
		} catch (err) {
			errorDiv.textContent = 'Login failed. Please try again.';
		}
	});
});
