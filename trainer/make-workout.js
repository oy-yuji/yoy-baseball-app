/* Make-workout inline row implementation */
const db = window.sb || window.db;
let allExercises = [];

async function loadExercises() {
  if (!db) return;
  const { data, error } = await db.from('exercises').select('id, name, category');
  if (!error && data) {
    allExercises = data.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }
}

function createExercisePicker() {
  return (`
    <div class="exercise-picker" style="width:340px;max-width:100%;">
      <input
        type="text"
        class="form-control form-control-sm exercise-filter mb-1"
        placeholder="Filter exercises..."
      >
      <select class="form-select form-select-sm exercise-select" size="8"></select>
    </div>
  `);
}

function makeExerciseOption(e) { return `<option value="${e.id}">${e.name}</option>` }

function renderExerciseOptions(selectEl, filterText = '', selectedValue = '') {
  if (!selectEl) return;

  const selected = String(selectedValue || '');
  const needle = String(filterText || '').toLowerCase().trim();
  const filtered = needle
    ? allExercises.filter((e) => String(e.name || '').toLowerCase().includes(needle))
    : allExercises;

  if (!filtered.length) {
    selectEl.innerHTML = '<option value="">No exercises found</option>';
    selectEl.value = '';
    return;
  }

  selectEl.innerHTML = filtered.map(makeExerciseOption).join('');
  const hasSelected = filtered.some((e) => String(e.id) === selected);
  selectEl.value = hasSelected ? selected : String(filtered[0].id);
}

function numberToLabel(num) {
  let n = num;
  let label = '';
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

function getNextSupersetLabel(container) {
  const rows = Array.from(container.querySelectorAll('.workout-row'));
  const used = new Set(
    rows
      .map((row) => (row.dataset.superset || '').trim())
      .filter(Boolean)
  );

  let idx = 1;
  while (used.has(numberToLabel(idx))) idx += 1;
  return numberToLabel(idx);
}

function setRowSuperset(row, label = '') {
  const badge = row.querySelector('.superset-badge');
  if (!badge) return;

  if (!label) {
    row.dataset.superset = '';
    badge.textContent = '';
    badge.classList.add('d-none');
    return;
  }

  row.dataset.superset = label;
  badge.textContent = `SS ${label}`;
  badge.classList.remove('d-none');
}

function cleanupOrphanSupersetGroups(container) {
  const rows = Array.from(container.querySelectorAll('.workout-row'));
  const counts = rows.reduce((acc, row) => {
    const label = row.dataset.superset || '';
    if (!label) return acc;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  rows.forEach((row) => {
    const label = row.dataset.superset || '';
    if (label && counts[label] < 2) setRowSuperset(row, '');
  });
}

function seedRowFromSource(row, sourceRow) {
  if (!sourceRow) return;

  const sourceFilter = sourceRow.querySelector('.exercise-filter')?.value || '';
  const sourceExerciseId = sourceRow.querySelector('.exercise-select')?.value || '';
  const filterInput = row.querySelector('.exercise-filter');
  const exerciseSelect = row.querySelector('.exercise-select');
  if (filterInput) filterInput.value = sourceFilter;
  renderExerciseOptions(exerciseSelect, sourceFilter, sourceExerciseId);

  const sourceSets = sourceRow.querySelector('.sets-input')?.value || '';
  const sourceRest = sourceRow.querySelector('.rest-input')?.value || '';
  row.querySelector('.sets-input').value = sourceSets;
  row.querySelector('.rest-input').value = sourceRest;
}

function createSupersetPartner(sourceRow, container) {
  const label = sourceRow.dataset.superset || getNextSupersetLabel(container);
  setRowSuperset(sourceRow, label);

  const sourceRestInput = sourceRow.querySelector('.rest-input');
  const sourceRest = sourceRestInput?.value || '';
  if (sourceRestInput && !sourceRest) sourceRestInput.value = '0';

  const partner = buildRow();
  seedRowFromSource(partner, sourceRow);
  setRowSuperset(partner, label);

  const partnerRestInput = partner.querySelector('.rest-input');
  if (partnerRestInput && !partnerRestInput.value) partnerRestInput.value = sourceRest || '60';

  sourceRow.insertAdjacentElement('afterend', partner);
  cleanupOrphanSupersetGroups(container);
  return partner;
}

function buildRow() {
  const row = document.createElement('div');
  row.className = 'list-group-item workout-row d-flex flex-wrap gap-2 align-items-center';
  row.innerHTML = `
    ${createExercisePicker()}
    <input type="number" class="form-control form-control-sm sets-input" placeholder="Sets" min="1" style="width:80px">
    <input type="text" class="form-control form-control-sm reps-input" placeholder="Reps" style="width:100px">
    <input type="number" class="form-control form-control-sm rest-input" placeholder="Rest(s)" min="0" style="width:100px">
    <span class="badge text-bg-info superset-badge d-none"></span>
    <button type="button" class="btn btn-sm btn-outline-secondary make-superset">+ Superset</button>
    <button class="btn btn-sm btn-outline-danger remove-row">Remove</button>
  `;

  // wire events
  const filterInput = row.querySelector('.exercise-filter');
  const exerciseSelect = row.querySelector('.exercise-select');
  const removeBtn = row.querySelector('.remove-row');
  const supersetBtn = row.querySelector('.make-superset');

  renderExerciseOptions(exerciseSelect, '', '');

  if (filterInput) {
    filterInput.addEventListener('input', () => {
      renderExerciseOptions(exerciseSelect, filterInput.value, exerciseSelect.value);
    });
  }

  removeBtn.addEventListener('click', () => {
    const container = row.parentElement;
    row.remove();
    if (container) cleanupOrphanSupersetGroups(container);
  });

  supersetBtn.addEventListener('click', () => {
    const container = row.parentElement;
    if (!container) return;
    createSupersetPartner(row, container);
  });

  return row;
}

function showAlert(message, type='success'){
  const alertContainer = document.getElementById('workoutAlert');
  if (!alertContainer) return;
  alertContainer.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
  // ensure it's visible to the user
  alertContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // auto-dismiss after 4 seconds
  setTimeout(() => {
    const a = alertContainer.querySelector('.alert');
    if (a) {
      a.classList.remove('show');
      a.classList.add('hide');
      // remove from DOM after animation
      setTimeout(() => { if (alertContainer) alertContainer.innerHTML = ''; }, 250);
    }
  }, 4000);
}

async function init() {
  await loadExercises();

  // Insert alert container
  const card = document.querySelector('.card');
  const alertDiv = document.createElement('div');
  alertDiv.id = 'workoutAlert';
  card.insertBefore(alertDiv, card.firstChild);

  const exerciseList = document.getElementById('exerciseList');
  const addBtn = document.getElementById('addExerciseBtn');
  const addSupersetBtn = document.getElementById('addSupersetBtn');
  const workoutForm = document.getElementById('workoutForm');

  addBtn.addEventListener('click', () => {
    const row = buildRow();
    exerciseList.appendChild(row);
  });

  if (addSupersetBtn) {
    addSupersetBtn.addEventListener('click', () => {
      const first = buildRow();
      exerciseList.appendChild(first);
      createSupersetPartner(first, exerciseList);
    });
  }

  // Preload one row
  const firstRow = buildRow();
  exerciseList.appendChild(firstRow);

  workoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = workoutForm.querySelector('#workoutName');
    const categoryInput = workoutForm.querySelector('#workoutCategory');
    if (!nameInput || !categoryInput) { showAlert('Form inputs missing from the page', 'danger'); return; }
    const name = nameInput.value.trim();
    const category = (categoryInput.value || 'other').trim().toLowerCase();
    if (!name) { showAlert('Please enter a workout name', 'danger'); return; }

    // get session for trainer id
    const { data: sessData, error: sessErr } = await db.auth.getSession();
    if (sessErr || !sessData.session) { showAlert('Not logged in', 'danger'); return; }
    const trainerId = sessData.session.user.id;

    console.log('Creating workout payload:', { created_by: trainerId, name, category });

    // collect rows
    const rows = Array.from(document.querySelectorAll('.workout-row'));
    if (rows.length === 0) { showAlert('Add at least one exercise', 'danger'); return; }

    cleanupOrphanSupersetGroups(exerciseList);

    const weRecords = [];
    for (let i=0;i<rows.length;i++){
      const r = rows[i];
      const exerciseId = r.querySelector('.exercise-select').value;
      const sets = parseInt(r.querySelector('.sets-input').value || '0');
      const repsInput = (r.querySelector('.reps-input').value || '').trim();
      const supersetLabel = r.dataset.superset || '';
      const reps = supersetLabel ? `[SS ${supersetLabel}] ${repsInput}`.trim() : repsInput;
      const rest = parseInt(r.querySelector('.rest-input').value || '0');
      if (!exerciseId) { showAlert('Please select an exercise for each row', 'danger'); return; }
      weRecords.push({ exercise_id: exerciseId, sets, reps, rest_seconds: rest, order_index: i });
    }

    // insert workout
    const insertPayload = { created_by: trainerId, name, category };
    const resp = await db.from('workouts').insert(insertPayload).select('id');
    console.log('workouts insert response:', resp);
    const wErr = resp.error; const wData = resp.data && resp.data[0];
    if (wErr || !wData) { showAlert('Failed to create workout: ' + (wErr?.message || JSON.stringify(resp)), 'danger'); return; }
    const workoutId = wData.id;

    // attach workout_id to records
    const insertRecords = weRecords.map(r => ({ ...r, workout_id: workoutId }));
    const { error: weErr } = await db.from('workout_exercises').insert(insertRecords);
    if (weErr) { showAlert('Failed to save workout exercises: ' + weErr.message, 'danger'); return; }

    showAlert('Workout created successfully!', 'success');
    workoutForm.reset();
    exerciseList.innerHTML = '';
    const resetRow = buildRow();
    exerciseList.appendChild(resetRow);
  });
}

document.addEventListener('DOMContentLoaded', init);