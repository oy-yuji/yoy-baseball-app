let currentTrainerId = '';
let athleteRowsData = [];
let sortState = { key: null, direction: 'asc' };

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function compareText(left, right) {
  return String(left || '').localeCompare(String(right || ''), undefined, { sensitivity: 'base' });
}

function compareNumber(left, right) {
  const a = Number.parseFloat(left);
  const b = Number.parseFloat(right);
  const aMissing = Number.isNaN(a);
  const bMissing = Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
}

function compareDate(left, right) {
  const a = Date.parse(left || '');
  const b = Date.parse(right || '');
  const aMissing = Number.isNaN(a);
  const bMissing = Number.isNaN(b);
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
}

function getSortedAthletes(rows) {
  const sorted = [...(rows || [])];
  if (!sortState.key) return sorted;

  sorted.sort((a, b) => {
    let result = 0;
    switch (sortState.key) {
      case 'height_cm':
      case 'weight_lbs':
        result = compareNumber(a[sortState.key], b[sortState.key]);
        break;
      case 'birthday':
        result = compareDate(a[sortState.key], b[sortState.key]);
        break;
      default:
        result = compareText(a[sortState.key], b[sortState.key]);
        break;
    }
    return sortState.direction === 'desc' ? -result : result;
  });

  return sorted;
}

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

function applyAthleteNameFilter() {
  const input = document.getElementById('athleteSearchInput');
  const meta = document.getElementById('athleteSearchMeta');
  const rows = Array.from(document.querySelectorAll('#athletesTableBody tr'));
  if (!input || !meta) return;

  const query = normalizeSearchText(input.value);
  let visible = 0;

  rows.forEach((row) => {
    const name = row.dataset.athleteName || '';
    const show = !query || name.includes(query);
    row.classList.toggle('d-none', !show);
    if (show) visible += 1;
  });

  if (!rows.length) {
    meta.textContent = '';
    return;
  }

  meta.textContent = query
    ? `Showing ${visible} of ${rows.length} athletes`
    : `Showing all ${rows.length} athletes`;
}

function updateSortHeaderIndicators() {
  const headers = Array.from(document.querySelectorAll('.sortable-header'));
  headers.forEach((header) => {
    const indicator = header.querySelector('.sort-indicator');
    if (!indicator) return;
    if (header.dataset.key !== sortState.key) {
      indicator.textContent = '';
      return;
    }
    indicator.textContent = sortState.direction === 'asc' ? '▲' : '▼';
  });
}

function renderAthletesTable() {
  const sorted = getSortedAthletes(athleteRowsData);
  renderAthleteRows(sorted);
  updateSortHeaderIndicators();
}

function bindAthleteSearch() {
  const input = document.getElementById('athleteSearchInput');
  if (!input || input.dataset.bound === 'true') return;
  input.addEventListener('input', applyAthleteNameFilter);
  input.dataset.bound = 'true';
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

function bindAthleteSortHeaders() {
  const headers = Array.from(document.querySelectorAll('.sortable-header'));
  headers.forEach((header) => {
    if (header.dataset.bound === 'true') return;
    header.addEventListener('click', () => {
      const key = header.dataset.key || '';
      if (!key) return;
      if (sortState.key === key) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.key = key;
        sortState.direction = 'asc';
      }
      renderAthletesTable();
    });
    header.dataset.bound = 'true';
  });
}

function renderAthleteRows(rows) {
  const tbody = document.getElementById('athletesTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  rows.forEach((a) => {
    const fullName = a.full_name || '';
    const row = document.createElement('tr');
    row.dataset.athleteName = normalizeSearchText(fullName);
    row.innerHTML = `
      <td>
        <a href="calendar.html?athlete=${encodeURIComponent(a.id)}" class="text-primary text-decoration-underline" title="Open Calendar">
          ${escapeHtml(fullName)}
        </a>
      </td>
      <td>${escapeHtml(a.email || '')}</td>
      <td>${escapeHtml(a.position || '')}</td>
      <td>${escapeHtml(a.height_cm || '')}</td>
      <td>${escapeHtml(a.weight_lbs || '')}</td>
      <td>${escapeHtml(a.birthday || '')}</td>
      <td class="d-flex flex-wrap gap-2">
        <a href="athlete-detail.html?id=${encodeURIComponent(a.id)}" class="btn btn-sm btn-outline-primary">Check Logs</a>
        <button type="button" class="btn btn-sm btn-outline-danger delete-athlete-btn" data-athlete-id="${escapeHtml(a.id)}" data-athlete-name="${escapeHtml(fullName || 'this athlete')}">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  applyAthleteNameFilter();
}

async function deleteAthleteAsTrainer(athleteId, athleteName) {
  if (!currentTrainerId) {
    showAlert('Could not verify trainer session. Please refresh and try again.');
    return;
  }

  const ok = await confirmActionModal(`Delete ${athleteName || 'this athlete'}? This cannot be undone.`, 'Delete Athlete');
  if (!ok) return;

  const { data: deletedRows, error } = await window.sb
    .from('athletes')
    .delete()
    .select('id')
    .eq('id', athleteId)
    .eq('trainer_id', currentTrainerId);

  if (error) {
    showAlert('Failed to delete athlete: ' + error.message);
    return;
  }

  if (!deletedRows || deletedRows.length === 0) {
    showAlert('Delete was blocked or no matching athlete was found. Please check permissions or refresh the page.');
    return;
  }

  showAlert('Athlete deleted.', 'success');
  await loadMyAthletes();
}

function bindDeleteButtons() {
  const tbody = document.getElementById('athletesTableBody');
  if (!tbody || tbody.dataset.deleteBound === 'true') return;

  tbody.addEventListener('click', async (event) => {
    const btn = event.target.closest('.delete-athlete-btn');
    if (!btn) return;

    btn.disabled = true;
    try {
      await deleteAthleteAsTrainer(btn.dataset.athleteId || '', btn.dataset.athleteName || 'this athlete');
    } finally {
      btn.disabled = false;
    }
  });

  tbody.dataset.deleteBound = 'true';
}

async function loadMyAthletes() {
  if (!window.sb) {
    showAlert('Supabase client not initialized.');
    console.error('window.sb missing');
    return;
  }

  try {
    const { data: { session }, error: sessErr } = await window.sb.auth.getSession();
    if (sessErr) {
      showAlert('Could not get session: ' + sessErr.message);
      return;
    }

    const userId = session?.user?.id;
    currentTrainerId = userId || '';
    if (!userId) {
      showAlert('You must be logged in to view your athletes.');
      return;
    }

    const userNavbarName = document.getElementById('userNavbarName');
    if (userNavbarName) {
      userNavbarName.textContent = session.user?.user_metadata?.full_name || session.user?.email || '';
    }

    let resp = await window.sb
      .from('athletes')
      .select('id, position, height_cm, weight_lbs, birthday, throwing_side, batting_side, users(full_name,email)')
      .eq('trainer_id', userId);

    if (resp.error) {
      showAlert('Failed to load athletes: ' + resp.error.message);
      console.error(resp.error);
      return;
    }

    let athletes = resp.data || [];
    if (!athletes.length) {
      const fallback = await window.sb
        .from('athletes')
        .select('id, position, height_cm, weight_lbs, birthday, throwing_side, batting_side')
        .eq('trainer_id', userId);

      if (fallback.error) {
        showAlert('Failed to load athletes: ' + fallback.error.message);
        return;
      }

      athletes = fallback.data || [];
      if (!athletes.length) {
        const tbody = document.getElementById('athletesTableBody');
        if (tbody) tbody.innerHTML = '';
        athleteRowsData = [];
        updateSortHeaderIndicators();
        showAlert('No athletes found.', 'info');
        return;
      }

      const ids = athletes.map((a) => a.id).filter(Boolean);
      const usersById = {};
      if (ids.length) {
        const usersResp = await window.sb.from('users').select('id, full_name, email').in('id', ids);
        if (!usersResp.error && usersResp.data) {
          usersResp.data.forEach((u) => {
            usersById[u.id] = u;
          });
        }
      }

      athleteRowsData = athletes.map((a) => {
        const user = usersById[a.id] || {};
        return {
          id: a.id,
          full_name: user.full_name || '',
          email: user.email || '',
          position: a.position,
          height_cm: a.height_cm,
          weight_lbs: a.weight_lbs,
          birthday: a.birthday,
          throwing_side: a.throwing_side,
          batting_side: a.batting_side
        };
      });
      renderAthletesTable();
      clearAlert();
      return;
    }

    athleteRowsData = athletes.map((a) => ({
      id: a.id,
      full_name: a.users?.full_name || '',
      email: a.users?.email || '',
      position: a.position,
      height_cm: a.height_cm,
      weight_lbs: a.weight_lbs,
      birthday: a.birthday,
      throwing_side: a.throwing_side,
      batting_side: a.batting_side
    }));
    renderAthletesTable();
    clearAlert();
  } catch (err) {
    showAlert('Error loading athletes: ' + (err.message || err));
    console.error(err);
  }
}

function initMyAthletesPage() {
  bindDeleteButtons();
  bindAthleteSearch();
  bindAthleteSortHeaders();
  loadMyAthletes();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMyAthletesPage);
} else {
  initMyAthletesPage();
}
