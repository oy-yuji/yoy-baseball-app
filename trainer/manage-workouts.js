const db = window.sb || window.db;
const EXERCISE_CATEGORIES = ['warmup', 'upper', 'lower', 'pitching', 'hitting', 'plyometric', 'conditioning', 'other'];
const CATEGORY_LABELS = {
  warmup: 'Warmup',
  upper: 'Upper',
  lower: 'Lower',
  pitching: 'Pitching',
  hitting: 'Hitting',
  plyometric: 'Plyometric',
  conditioning: 'Conditioning',
  other: 'Other'
};

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

function normalizeSearchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
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

function buildCategoryOptions(selected) {
  const selectedRaw = (selected || 'other').toString().toLowerCase();
  const selectedValue = selectedRaw === 'hybrid' ? 'plyometric' : selectedRaw;
  return EXERCISE_CATEGORIES
    .map((category) => {
      const label = CATEGORY_LABELS[category] || (category.charAt(0).toUpperCase() + category.slice(1));
      return `<option value="${category}" ${category === selectedValue ? 'selected' : ''}>${label}</option>`;
    })
    .join('');
}

function buildExerciseRow(ex, idx, total) {
  const exerciseId = ex.exercise?.id || '';
  const name = escapeHtml(ex.exercise?.name || 'Exercise');
  const categoryRaw = (ex.exercise?.category || 'other').toString().toLowerCase();
  const category = categoryRaw === 'hybrid' ? 'plyometric' : categoryRaw;
  const videoUrl = escapeHtml(ex.exercise?.demo_video_url || '');
  const reps = escapeHtml(ex.reps || '');
  const sets = Number.isFinite(Number(ex.sets)) ? Number(ex.sets) : '';
  const rest = Number.isFinite(Number(ex.rest_seconds)) ? Number(ex.rest_seconds) : '';
  return `
    <li class="list-group-item workout-ex-row" data-row-id="${ex.id}" data-exercise-id="${exerciseId}">
      <div class="d-flex justify-content-between align-items-start gap-2">
        <div class="flex-grow-1">
          <div class="small text-muted mb-2">Drag to reorder. Save will update this workout and exercise details.</div>
          <div class="row g-2 mb-2">
            <div class="col-12 col-sm-6">
              <label class="form-label form-label-sm mb-1">Exercise Name</label>
              <input type="text" class="form-control form-control-sm exercise-name-edit" value="${name}" />
            </div>
            <div class="col-12 col-sm-3">
              <label class="form-label form-label-sm mb-1">Category</label>
              <select class="form-select form-select-sm exercise-category-edit">
                ${buildCategoryOptions(category)}
              </select>
            </div>
            <div class="col-12 col-sm-3">
              <label class="form-label form-label-sm mb-1">Video Link</label>
              <input type="url" class="form-control form-control-sm exercise-video-edit" placeholder="https://..." value="${videoUrl}" />
            </div>
          </div>
          <div class="row g-2">
            <div class="col-12 col-sm-4">
              <label class="form-label form-label-sm mb-1">Sets</label>
              <input type="number" min="1" step="1" class="form-control form-control-sm sets-edit" value="${sets}" />
            </div>
            <div class="col-12 col-sm-4">
              <label class="form-label form-label-sm mb-1">Reps</label>
              <input type="text" class="form-control form-control-sm reps-edit" value="${reps}" />
            </div>
            <div class="col-12 col-sm-4">
              <label class="form-label form-label-sm mb-1">Rest (sec)</label>
              <input type="number" min="0" step="1" class="form-control form-control-sm rest-edit" value="${rest}" />
            </div>
          </div>
        </div>
        <div class="d-flex align-items-center drag-handle text-muted" style="cursor: grab;" title="Drag to reorder">
          <i class="bi bi-grip-vertical fs-4" aria-hidden="true"></i>
        </div>
      </div>
    </li>
  `;
}

function renderWorkoutCard(workout) {
  const exercises = (workout.workout_exercises || [])
    .slice()
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  const searchableParts = [workout.name, workout.category];
  exercises.forEach((ex) => {
    searchableParts.push(ex.exercise?.name);
    searchableParts.push(ex.exercise?.category);
    searchableParts.push(ex.reps);
    searchableParts.push(ex.sets);
    searchableParts.push(ex.rest_seconds);
  });
  const searchIndex = normalizeSearchText(searchableParts.join(' '));

  return `
    <div class="card border-0 shadow-sm workout-card" data-workout-id="${workout.id}" data-search-index="${escapeHtml(searchIndex)}">
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

        <div class="small fw-semibold mb-2">Exercise Order and Details</div>
        <div class="small text-muted mb-2">Editing name/category/video updates the base exercise for any workout that uses it.</div>
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

function updateCardSearchIndex(card) {
  const workoutTitle = card.querySelector('h5')?.textContent || '';
  const workoutCategory = card.querySelector('.text-capitalize')?.textContent || '';
  const parts = [workoutTitle, workoutCategory];

  card.querySelectorAll('.workout-ex-row').forEach((row) => {
    parts.push(row.querySelector('.exercise-name-edit')?.value || '');
    parts.push(row.querySelector('.exercise-category-edit')?.value || '');
    parts.push(row.querySelector('.sets-edit')?.value || '');
    parts.push(row.querySelector('.reps-edit')?.value || '');
    parts.push(row.querySelector('.rest-edit')?.value || '');
  });

  card.dataset.searchIndex = normalizeSearchText(parts.join(' '));
}

function applyWorkoutFilter() {
  const searchInput = document.getElementById('workoutSearchInput');
  const meta = document.getElementById('workoutSearchMeta');
  const empty = document.getElementById('workoutSearchEmpty');
  const cards = Array.from(document.querySelectorAll('.workout-card'));
  if (!searchInput || !meta) return;

  const query = normalizeSearchText(searchInput.value || '');
  let visibleCount = 0;

  cards.forEach((card) => {
    const haystack = card.dataset.searchIndex || '';
    const show = !query || haystack.includes(query);
    card.classList.toggle('d-none', !show);
    if (show) visibleCount += 1;
  });

  if (!cards.length) {
    meta.textContent = '';
  } else {
    meta.textContent = query
      ? `Showing ${visibleCount} of ${cards.length} workouts`
      : `Showing all ${cards.length} workouts`;
  }

  if (empty) {
    empty.classList.toggle('d-none', visibleCount > 0 || cards.length === 0);
  }
}

function wireReorderHandlers(card) {
  const list = card.querySelector('.exercise-list');
  if (!list) return;

  if (window.Sortable) {
    new window.Sortable(list, {
      animation: 150,
      handle: '.drag-handle',
      draggable: '.workout-ex-row',
      ghostClass: 'bg-light'
    });
  }
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
    const exerciseUpdates = new Map();

    for (let i = 0; i < rows.length; i++) {
      const rowId = rows[i].dataset.rowId;
      const exerciseId = rows[i].dataset.exerciseId;
      const setsValue = rows[i].querySelector('.sets-edit')?.value?.trim() || '';
      const repsValue = rows[i].querySelector('.reps-edit')?.value ?? '';
      const restValue = rows[i].querySelector('.rest-edit')?.value?.trim() || '';
      const exerciseName = rows[i].querySelector('.exercise-name-edit')?.value?.trim() || '';
      const rawCategory = (rows[i].querySelector('.exercise-category-edit')?.value || 'other').trim().toLowerCase();
      const exerciseCategory = rawCategory === 'plyometric' ? 'hybrid' : rawCategory;
      const exerciseVideo = rows[i].querySelector('.exercise-video-edit')?.value?.trim() || '';
      const parsedSets = Number.parseInt(setsValue, 10);
      const parsedRest = restValue ? Number.parseInt(restValue, 10) : 0;

      if (!exerciseId) {
        throw new Error(`Missing exercise id for row ${i + 1}.`);
      }

      if (!exerciseName) {
        throw new Error(`Exercise name is required for row ${i + 1}.`);
      }

      if (exerciseVideo) {
        try {
          const parsedUrl = new URL(exerciseVideo);
          if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new Error('Video link must start with http or https.');
          }
        } catch (_err) {
          throw new Error(`Video link is invalid for row ${i + 1}.`);
        }
      }

      if (!Number.isFinite(parsedSets) || parsedSets < 1) {
        throw new Error(`Sets must be at least 1 for row ${i + 1}.`);
      }

      if (!Number.isFinite(parsedRest) || parsedRest < 0) {
        throw new Error(`Rest must be 0 or more for row ${i + 1}.`);
      }

      const { error } = await db
        .from('workout_exercises')
        .update({
          order_index: i,
          sets: parsedSets,
          reps: repsValue,
          rest_seconds: parsedRest
        })
        .eq('id', rowId);
      if (error) throw error;

      exerciseUpdates.set(exerciseId, {
        name: exerciseName,
        category: exerciseCategory,
        demo_video_url: exerciseVideo || null
      });
    }

    for (const [exerciseId, payload] of exerciseUpdates.entries()) {
      const { error: exerciseErr } = await db
        .from('exercises')
        .update(payload)
        .eq('id', exerciseId);
      if (exerciseErr) throw exerciseErr;
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
          name,
          category,
          demo_video_url
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
    const meta = document.getElementById('workoutSearchMeta');
    if (meta) meta.textContent = '';
    return;
  }

  container.innerHTML = data.map(renderWorkoutCard).join('');

  const searchInput = document.getElementById('workoutSearchInput');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.addEventListener('input', applyWorkoutFilter);
    searchInput.dataset.bound = 'true';
  }

  container.querySelectorAll('.workout-card').forEach((card) => {
    wireReorderHandlers(card);
    updateCardSearchIndex(card);

    card.addEventListener('input', () => {
      updateCardSearchIndex(card);
      applyWorkoutFilter();
    });

    card.addEventListener('change', () => {
      updateCardSearchIndex(card);
      applyWorkoutFilter();
    });

    const saveBtn = card.querySelector('.save-order');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await saveExerciseOrder(card);
        updateCardSearchIndex(card);
        applyWorkoutFilter();
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
        applyWorkoutFilter();
      });
    }
  });

  applyWorkoutFilter();
}

document.addEventListener('DOMContentLoaded', loadWorkouts);