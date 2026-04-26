// Show/hide extra fields based on role
document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('registerForm');
  if (!form) return;
  // Only run roleSelect logic if present (for add-user.html)
  var roleSelect = document.getElementById('roleSelect');
  var athleteFields = document.getElementById('athleteFields');
  var trainerFields = document.getElementById('trainerFields');
  if (roleSelect && athleteFields && trainerFields) {
    roleSelect.addEventListener('change', function() {
      if (roleSelect.value === 'athlete') {
        athleteFields.style.display = '';
        trainerFields.style.display = 'none';
      } else if (roleSelect.value === 'trainer') {
        athleteFields.style.display = 'none';
        trainerFields.style.display = '';
      }
    });
    // Set initial state
    roleSelect.dispatchEvent(new Event('change'));
  }

    function showAlert(message, type = 'success') {
      const container = document.getElementById('alertContainer');
      if (!container) return;
      const wrapper = document.createElement('div');
      wrapper.className = `alert alert-${type} alert-dismissible fade show text-center mx-auto w-75`;
      // nicer readable font and spacing
      wrapper.style.fontSize = '1.05rem';
      wrapper.style.lineHeight = '1.4';
      wrapper.style.whiteSpace = 'pre-wrap';
      wrapper.textContent = message;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-close';
      btn.setAttribute('data-bs-dismiss', 'alert');
      btn.setAttribute('aria-label', 'Close');
      wrapper.appendChild(btn);
      container.prepend(wrapper);
      // remove after 10s
      setTimeout(() => {
        try { wrapper.classList.remove('show'); wrapper.classList.add('hide'); wrapper.remove(); } catch (e) {}
      }, 10000);
    }

    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      var formData = new FormData(form);
      var payload = {};
      formData.forEach((value, key) => { payload[key] = value; });

      const isAthleteFlow = payload.role === 'athlete' || window.location.pathname.endsWith('add-athlete.html');
      const entityLabel = isAthleteFlow ? 'Athlete' : 'Trainer';

      // Normalize password: whitespace-only should be treated as empty.
      const normalizedPassword = String(payload.password || '').trim();
      if (normalizedPassword) {
        payload.password = normalizedPassword;
      } else {
        delete payload.password;
      }

      // For trainer creation, blank password means email onboarding flow.
      if (!isAthleteFlow && !payload.password) {
        payload.send_reset_email = true;
      }

      // Basic client validation to avoid opaque createUser failures.
      if (payload.password && String(payload.password).length < 8) {
        showAlert(`${entityLabel} creation failed: Password must be at least 8 characters.`, 'danger');
        return;
      }

      // Get access token from Supabase Auth
      let accessToken = null;
      if (window.sb && window.sb.auth) {
        try {
          const { data: { session } } = await window.sb.auth.getSession();
          accessToken = session?.access_token;
        } catch (err) {
          console.error('Failed to get access token:', err);
        }
      }

      if (!accessToken) {
        showAlert('You must be logged in to register users.', 'danger');
        return;
      }

      // Call correct Edge Function for registration
      let EDGE_URL = 'https://vgaxwdipyghoxdtqkfrl.supabase.co/functions/v1/register-trainer';
      if (isAthleteFlow) {
        EDGE_URL = 'https://vgaxwdipyghoxdtqkfrl.supabase.co/functions/v1/register-athlete';
      }

      // If registering an athlete, nest position/height/weight/birthday and other athlete fields
      if (EDGE_URL.includes('register-athlete')) {
        const athleteData = {
          position: payload.position || null,
          height_cm: payload.height_cm || null,
          weight_lbs: payload.weight_lbs || null,
          birthday: payload.birthday || null,
          throwing_side: payload.throwing_side || null,
          batting_side: payload.batting_side || null
        };
        // remove individual keys from top-level payload
        delete payload.position;
        delete payload.height_cm;
        delete payload.weight_lbs;
        delete payload.birthday;
        delete payload.throwing_side;
        delete payload.batting_side;
        // attach nested athleteData
        payload.athleteData = athleteData;
      }
      // Debug: log payload before sending to edge function
      try { console.log('registration payload', JSON.parse(JSON.stringify(payload))); } catch (e) { console.log('payload', payload); }
      let response;
      try {
        response = await fetch(EDGE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(payload)
        });
      } catch (networkErr) {
        showAlert(`${entityLabel} creation failed: Could not reach registration service.`, 'danger');
        console.error('Registration network error:', networkErr);
        return;
      }

      let result = {};
      try {
        result = await response.json();
      } catch (_ignored) {
        result = {};
      }

      // Show Bootstrap alert for success/failure
      if (response.status !== 201 || !result.user) {
        const errorDetail = result.error || result.details || `HTTP ${response.status}`;
        showAlert(`${entityLabel} creation failed: ${errorDetail}`, 'danger');
        return;
      }

      let parts = [];
      parts.push(`${entityLabel} created: ${result.user.email || result.user.id}`);
      if (result.temp_password_provided && result.temp_password) {
        parts.push(`Temporary password: ${result.temp_password}`);
      }
      if (typeof result.auth_email_requested === 'boolean') {
        parts.push(`Auth email requested: ${result.auth_email_requested}`);
      }
      if (typeof result.email_sent === 'boolean') {
        parts.push(`Auth email sent: ${result.email_sent}`);
      }
      if (result.reset_email_error) {
        parts.push(`Auth email error: ${result.reset_email_error}`);
      }
      showAlert(parts.join('\n'), 'success');
      form.reset();
    });
});