function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

let currentTrainerId = '';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showAlert(msg, type = 'danger') {
  const alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) {
    console.log(msg);
    return;
  }
  alertContainer.innerHTML = `<div class="alert alert-${type} mb-0">${escapeHtml(msg)}</div>`;
}

function clearAlert() {
  const alertContainer = document.getElementById('alertContainer');
  if (alertContainer) alertContainer.innerHTML = '';
}

function confirmActionModal(message, title = 'Confirm Action') {
  return new Promise((resolve) => {
    if (!window.bootstrap || !window.bootstrap.Modal) {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const fallbackBackdrop = document.createElement('div');
      fallbackBackdrop.className = 'modal-backdrop show';
      fallbackBackdrop.style.zIndex = '1055';

      const fallbackDialog = document.createElement('div');
      fallbackDialog.className = 'position-fixed top-50 start-50 translate-middle bg-body border rounded-3 shadow p-3';
      fallbackDialog.style.zIndex = '1056';
      fallbackDialog.style.width = 'min(92vw, 420px)';
      if (dark) {
        fallbackDialog.style.background = '#111827';
        fallbackDialog.style.borderColor = '#334155';
        fallbackDialog.style.color = '#e2e8f0';
      }
      fallbackDialog.innerHTML = `
        <h5 class="mb-2">${escapeHtml(title)}</h5>
        <p class="mb-3">${escapeHtml(message)}</p>
        <div class="d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-outline-secondary" id="fallbackCancelBtn">Cancel</button>
          <button type="button" class="btn btn-danger" id="fallbackOkBtn">Delete</button>
        </div>
      `;

      const cleanup = (result) => {
        fallbackDialog.remove();
        fallbackBackdrop.remove();
        resolve(result);
      };

      fallbackDialog.querySelector('#fallbackCancelBtn').addEventListener('click', () => cleanup(false));
      fallbackDialog.querySelector('#fallbackOkBtn').addEventListener('click', () => cleanup(true));
      fallbackBackdrop.addEventListener('click', () => cleanup(false));

      document.body.appendChild(fallbackBackdrop);
      document.body.appendChild(fallbackDialog);
      return;
    }

    const existing = document.getElementById('confirmActionModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'confirmActionModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow">
          <div class="modal-header">
            <h5 class="modal-title">${escapeHtml(title)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">${escapeHtml(message)}</div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-danger" id="confirmActionYesBtn">Delete</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const modalInstance = new window.bootstrap.Modal(modal);
    const yesBtn = modal.querySelector('#confirmActionYesBtn');
    let settled = false;

    const finalize = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
      modal.remove();
    };

    yesBtn.addEventListener('click', () => {
      finalize(true);
      modalInstance.hide();
    });

    modal.addEventListener('hidden.bs.modal', () => finalize(false));
    modalInstance.show();
  });
}

function renderRows(athletes, usersById = {}, useJoined = false) {
  const tbody = document.getElementById('athletesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  athletes.forEach((a) => {
    const user = useJoined ? (a.users || {}) : (usersById[a.id] || {});
    const fullName = user.full_name || '';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(fullName)}</td>
      <td>${escapeHtml(user.email || '')}</td>
      <td>${escapeHtml(a.position || '')}</td>
      <td>${escapeHtml(a.height_cm || '')}</td>
      <td>${escapeHtml(a.weight_lbs || '')}</td>
      <td>${escapeHtml(a.birthday || '')}</td>
      <td>
        <button type="button" class="btn btn-sm btn-outline-danger delete-athlete-btn" data-athlete-id="${escapeHtml(a.id)}" data-athlete-name="${escapeHtml(fullName || 'this athlete')}">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function deleteAthleteAsAdmin(athleteId, athleteName) {
  const ok = await confirmActionModal(`Delete ${athleteName || 'this athlete'}? This cannot be undone.`, 'Delete Athlete');
  if (!ok) return;

  const { data: deletedRows, error } = await window.sb
    .from('athletes')
    .delete()
    .select('id')
    .eq('id', athleteId);

  if (error) {
    showAlert('Failed to delete athlete: ' + error.message);
    return;
  }

  if (!deletedRows || deletedRows.length === 0) {
    showAlert('Delete was blocked or no matching athlete was found. Your current permissions may not allow this action.');
    return;
  }

  showAlert('Athlete deleted.', 'success');
  await loadTrainerAthletes();
}

function bindDeleteButtons() {
  const tbody = document.getElementById('athletesTableBody');
  if (!tbody || tbody.dataset.deleteBound === 'true') return;

  tbody.addEventListener('click', async (event) => {
    const btn = event.target.closest('.delete-athlete-btn');
    if (!btn) return;

    btn.disabled = true;
    try {
      await deleteAthleteAsAdmin(btn.dataset.athleteId || '', btn.dataset.athleteName || 'this athlete');
    } finally {
      btn.disabled = false;
    }
  });

  tbody.dataset.deleteBound = 'true';
}

async function loadTrainerAthletes() {
  const trainerId = getQueryParam('trainer_id');
  const trainerName = getQueryParam('trainer_name') || '';
  currentTrainerId = trainerId || '';

  if (!trainerId) {
    showAlert('Missing trainer_id in URL');
    return;
  }
  if (!window.sb) { showAlert('Supabase client not initialized.'); return; }

  document.getElementById('pageTitle').textContent = `Athletes for ${decodeURIComponent(trainerName)}`;

  try {
    // Try joined select first (if foreign-key relationship is configured)
    let resp = await window.sb
      .from('athletes')
      .select('id, position, height_cm, weight_lbs, birthday, throwing_side, batting_side, users(full_name,email)')
      .eq('trainer_id', trainerId);
    console.log('Athletes response (joined):', resp);
    if (resp.error) {
      showAlert('Failed to load athletes: ' + resp.error.message);
      console.error(resp.error);
      return;
    }

    let athletes = resp.data || [];

    // If the joined select returned no rows (RLS or relationship mismatch), fall back to fetching athletes then users
    if (!athletes || athletes.length === 0) {
      console.warn('Joined select returned no athletes, trying fallback fetch of athlete rows then users.');
      const fallback = await window.sb
        .from('athletes')
        .select('id, position, height_cm, weight_lbs, birthday, throwing_side, batting_side')
        .eq('trainer_id', trainerId);
      console.log('Athletes response (fallback):', fallback);
      if (fallback.error) {
        showAlert('Failed to load athletes: ' + fallback.error.message);
        console.error(fallback.error);
        return;
      }
      athletes = fallback.data || [];

      if (!athletes || athletes.length === 0) {
        const tbody = document.getElementById('athletesTableBody');
        if (tbody) tbody.innerHTML = '';
        showAlert('No athletes found for this trainer.', 'info');
        return;
      }

      // batch-load users for the athlete ids
      const ids = athletes.map(a => a.id).filter(Boolean);
      let usersById = {};
      if (ids.length > 0) {
        const usersResp = await window.sb.from('users').select('id, full_name, email').in('id', ids);
        console.log('Users batch response:', usersResp);
        if (!usersResp.error && usersResp.data) {
          usersResp.data.forEach(u => { usersById[u.id] = u; });
        }
      }

      renderRows(athletes, usersById, false);
      clearAlert();
      return;
    }

    // Render joined results when available
    renderRows(athletes, {}, true);
    clearAlert();
  } catch (e) {
    showAlert('Error loading athletes: ' + (e.message || e));
    console.error(e);
  }
}

function initTrainerAthletesPage() {
  bindDeleteButtons();
  loadTrainerAthletes();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTrainerAthletesPage);
} else {
  initTrainerAthletesPage();
}
