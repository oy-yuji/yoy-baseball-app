const db = window.sb || window.db;

function showAlert(message, type = 'success') {
  const el = document.getElementById('pageAlert');
  if (!el) return;
  el.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body">
        <div class="alert alert-info mb-0">No workouts found. Create one from Make a Workout.</div>
      </div>
    </div>
  `;
}

function buildExerciseRow(ex, idx, total) {
  const name = escapeHtml(ex.exercise?.name || 'Exercise');
  const reps = escapeHtml(ex.reps || '');
  const sets = Number.isFinite(Number(ex.sets)) ? Number(ex.sets) : '';
  const rest = ex.rest_seconds ?? '-';
  return `
    <li class="list-group-item workout-ex-row" data-row-id="${ex.id}">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="flex-grow-1">
          <div class="fw-semibold">${name}</div>
          <div class="small text-muted mb-2">Rest: ${rest}s</div>
          <div class="row g-2">
            <div class="col-12 col-sm-4">
              <label class="form-label form-label-sm mb-1">Sets</label>
              <input type="number" min="1" step="1" class="form-control form-control-sm sets-edit" value="${sets}" />
            </div>
            <div class="col-12 col-sm-8">
              <label class="form-label form-label-sm mb-1">Reps</label>
              <input type="text" class="form-control form-control-sm reps-edit" value="${reps}" />
            </div>
          </div>
        </div>
        <div class="btn-group btn-group-sm" role="group" aria-label="Reorder exercise">
          <button class="btn btn-outline-secondary move-up" type="button" ${idx === 0 ? 'disabled' : ''}>
            <i class="bi bi-arrow-up"></i>
          </button>
          <button class="btn btn-outline-secondary move-down" type="button" ${idx === total - 1 ? 'disabled' : ''}>
            <i class="bi bi-arrow-down"></i>
          </button>
        </div>
      </div>
    </li>
  `;
}

function renderWorkoutCard(workout) {
  const exercises = (workout.workout_exercises || [])
    .slice()
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  return `
    <div class="card border-0 shadow-sm workout-card" data-workout-id="${workout.id}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <div>
            <h5 class="mb-1">${escapeHtml(workout.name || 'Workout')}</h5>
            <div class="small text-muted text-capitalize">Category: ${escapeHtml(workout.category || 'other')}</div>
          </div>
          <button class="btn btn-sm btn-outline-danger delete-workout" type="button">
            <i class="bi bi-trash"></i>
            Delete Workout
          </button>
        </div>

        <div class="small fw-semibold mb-2">Exercise Order, Reps, and Sets</div>
        <ul class="list-group mb-3 exercise-list">
          ${exercises.length
            ? exercises.map((ex, idx) => buildExerciseRow(ex, idx, exercises.length)).join('')
            : '<li class="list-group-item text-muted">No exercises in this workout.</li>'}
        </ul>

        <div class="d-flex justify-content-end">
          <button class="btn btn-primary btn-sm save-order" type="button" ${exercises.length ? '' : 'disabled'}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  `;
}

function wireReorderHandlers(card) {
  const list = card.querySelector('.exercise-list');
  if (!list) return;

  function refreshButtons() {
    const rows = Array.from(list.querySelectorAll('.workout-ex-row'));
    rows.forEach((row, idx) => {
      const up = row.querySelector('.move-up');
      const down = row.querySelector('.move-down');
      if (up) up.disabled = idx === 0;
      if (down) down.disabled = idx === rows.length - 1;
    });
  }

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    const row = event.target.closest('.workout-ex-row');
    if (!row) return;

    if (button.classList.contains('move-up')) {
      const prev = row.previousElementSibling;
      if (prev && prev.classList.contains('workout-ex-row')) {
        list.insertBefore(row, prev);
        refreshButtons();
      }
    }

    if (button.classList.contains('move-down')) {
      const next = row.nextElementSibling;
      if (next && next.classList.contains('workout-ex-row')) {
        list.insertBefore(next, row);
        refreshButtons();
      }
    }
  });

  refreshButtons();
}

async function saveExerciseOrder(card) {
  const rows = Array.from(card.querySelectorAll('.workout-ex-row'));
  if (!rows.length) return;

  const saveBtn = card.querySelector('.save-order');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    for (let i = 0; i < rows.length; i++) {
      const rowId = rows[i].dataset.rowId;
      const setsValue = rows[i].querySelector('.sets-edit')?.value?.trim() || '';
      const repsValue = rows[i].querySelector('.reps-edit')?.value ?? '';
      const parsedSets = Number.parseInt(setsValue, 10);

      if (!Number.isFinite(parsedSets) || parsedSets < 1) {
        throw new Error(`Sets must be at least 1 for row ${i + 1}.`);
      }

      const { error } = await db
        .from('workout_exercises')
        .update({
          order_index: i,
          sets: parsedSets,
          reps: repsValue
        })
        .eq('id', rowId);
      if (error) throw error;
    }
    showAlert('Workout changes saved.', 'success');
  } catch (error) {
    showAlert(`Failed to save changes: ${error.message || error}`, 'danger');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  }
}

async function deleteWorkout(workoutId) {
  const ok = window.confirm('Delete this workout? This action cannot be undone.');
  if (!ok) return false;

  // Delete children first for schemas without cascade constraints.
  const { error: childDeleteErr } = await db
    .from('workout_exercises')
    .delete()
    .eq('workout_id', workoutId);

  if (childDeleteErr) {
    showAlert(`Failed to delete workout exercises: ${childDeleteErr.message}`, 'danger');
    return false;
  }

  const { error: workoutDeleteErr } = await db
    .from('workouts')
    .delete()
    .eq('id', workoutId);

  if (workoutDeleteErr) {
    showAlert(`Failed to delete workout: ${workoutDeleteErr.message}`, 'danger');
    return false;
  }

  showAlert('Workout deleted.', 'success');
  return true;
}

async function loadWorkouts() {
  if (!db) return;

  const container = document.getElementById('workoutsContainer');
  if (!container) return;
  container.innerHTML = '<div class="text-muted">Loading workouts...</div>';

  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  if (sessionError || !sessionData?.session?.user?.id) {
    location.href = '../index.html';
    return;
  }

  const trainerId = sessionData.session.user.id;

  const { data, error } = await db
    .from('workouts')
    .select(`
      id,
      name,
      category,
      workout_exercises (
        id,
        order_index,
        sets,
        reps,
        rest_seconds,
        exercise:exercises (
          id,
          name
        )
      )
    `)
    .eq('created_by', trainerId)
    .order('name', { ascending: true });

  if (error) {
    container.innerHTML = '<div class="text-danger">Failed to load workouts.</div>';
    showAlert(`Failed to load workouts: ${error.message}`, 'danger');
    return;
  }

  if (!data || !data.length) {
    renderEmptyState(container);
    return;
  }

  container.innerHTML = data.map(renderWorkoutCard).join('');

  container.querySelectorAll('.workout-card').forEach((card) => {
    wireReorderHandlers(card);

    const saveBtn = card.querySelector('.save-order');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await saveExerciseOrder(card);
      });
    }

    const deleteBtn = card.querySelector('.delete-workout');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const workoutId = card.dataset.workoutId;
        if (!workoutId) return;
        const deleted = await deleteWorkout(workoutId);
        if (deleted) card.remove();

        if (!container.querySelector('.workout-card')) {
          renderEmptyState(container);
        }
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', loadWorkouts);