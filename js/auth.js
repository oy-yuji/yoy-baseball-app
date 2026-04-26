// Real login handler using Supabase
document.addEventListener('DOMContentLoaded', function () {
	const form = document.getElementById('loginForm');
	const errorDiv = document.getElementById('loginError');

	function promptForNewPassword() {
		if (!window.bootstrap || !window.bootstrap.Modal) {
			const fallback = window.prompt('Enter a new password (minimum 8 characters)');
			if (!fallback || fallback.length < 8) return Promise.resolve(null);
			const fallbackConfirm = window.prompt('Confirm your new password');
			if (!fallbackConfirm || fallbackConfirm !== fallback) return Promise.resolve(null);
			return Promise.resolve(fallback);
		}

		return new Promise((resolve) => {
			const modalId = `recoveryModal-${Date.now()}`;
			const passwordId = `recoveryPassword-${Date.now()}`;
			const confirmPasswordId = `recoveryConfirmPassword-${Date.now()}`;
			const modalHost = document.createElement('div');
			modalHost.innerHTML = `
				<div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
					<div class="modal-dialog modal-dialog-centered">
						<div class="modal-content">
							<div class="modal-header">
								<h5 class="modal-title">Set Your New Password</h5>
							</div>
							<div class="modal-body">
								<div class="alert alert-info py-2 mb-3" role="alert">
									<div class="fw-semibold mb-1">Password Requirements</div>
									<ul class="mb-0 ps-3">
										<li>At least 8 characters</li>
										<li>Confirmation password must match exactly</li>
									</ul>
								</div>
								<label for="${passwordId}" class="form-label">New Password</label>
								<input id="${passwordId}" type="password" class="form-control" minlength="8" autocomplete="new-password" />
								<div class="form-text">Minimum 8 characters.</div>
								<div class="invalid-feedback">Password must be at least 8 characters.</div>
								<label for="${confirmPasswordId}" class="form-label mt-3">Confirm New Password</label>
								<input id="${confirmPasswordId}" type="password" class="form-control" minlength="8" autocomplete="new-password" />
								<div class="invalid-feedback">Confirmation password must match exactly.</div>
							</div>
							<div class="modal-footer">
								<button type="button" class="btn btn-outline-secondary" data-action="cancel">Cancel</button>
								<button type="button" class="btn btn-primary" data-action="save">Update Password</button>
							</div>
						</div>
					</div>
				</div>
			`;

			const modalEl = modalHost.firstElementChild;
			document.body.appendChild(modalEl);

			const passwordInput = modalEl.querySelector(`#${passwordId}`);
			const confirmPasswordInput = modalEl.querySelector(`#${confirmPasswordId}`);
			const saveBtn = modalEl.querySelector('[data-action="save"]');
			const cancelBtn = modalEl.querySelector('[data-action="cancel"]');
			const modal = new window.bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
			let settled = false;

			const resolveOnce = (value) => {
				if (settled) return;
				settled = true;
				resolve(value);
				modal.hide();
			};

			const submitPassword = () => {
				const nextPassword = (passwordInput.value || '').trim();
				const confirmPassword = (confirmPasswordInput.value || '').trim();
				if (nextPassword.length < 8) {
					passwordInput.classList.add('is-invalid');
					passwordInput.focus();
					return;
				}
				if (confirmPassword.length < 8 || confirmPassword !== nextPassword) {
					confirmPasswordInput.classList.add('is-invalid');
					confirmPasswordInput.focus();
					return;
				}
				passwordInput.classList.remove('is-invalid');
				confirmPasswordInput.classList.remove('is-invalid');
				resolveOnce(nextPassword);
			};

			passwordInput.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					submitPassword();
				}
			});
			passwordInput.addEventListener('input', () => {
				if ((passwordInput.value || '').trim().length >= 8) {
					passwordInput.classList.remove('is-invalid');
				}
			});
			confirmPasswordInput.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					submitPassword();
				}
			});
			confirmPasswordInput.addEventListener('input', () => {
				const nextPassword = (passwordInput.value || '').trim();
				const confirmPassword = (confirmPasswordInput.value || '').trim();
				if (confirmPassword.length >= 8 && confirmPassword === nextPassword) {
					confirmPasswordInput.classList.remove('is-invalid');
				}
			});

			saveBtn.addEventListener('click', submitPassword);
			cancelBtn.addEventListener('click', () => resolveOnce(null));
			modalEl.addEventListener('hidden.bs.modal', () => {
				if (!settled) {
					settled = true;
					resolve(null);
				}
				modalEl.remove();
			});

			modal.show();
			setTimeout(() => passwordInput.focus(), 0);
		});
	}

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

		const nextPassword = await promptForNewPassword();
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
