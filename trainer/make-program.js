// Drag-and-drop program builder for make-program.html
// Requires SortableJS (CDN)

let allWorkouts = [];
const db = window.sb || window.db;

async function loadWorkouts() {
  if (!db) return;
  const { data, error } = await db.from('workouts').select('id, name, category');
  if (!error && data) allWorkouts = data;
}

// Fetch workout_exercises and exercise details for a workout
async function fetchWorkoutDetails(workoutId) {
  const { data, error } = await db
    .from('workout_exercises')
    .select('id, sets, reps, rest_seconds, order_index, exercise:exercises(id, name)')
    .eq('workout_id', workoutId)
    .order('order_index', { ascending: true });
  if (error) return [];
  return data;
}

function renderSidebar() {
  const sidebar = document.getElementById('workoutSidebar');
  // Group workouts by category
  const grouped = {};
  allWorkouts.forEach(w => {
    if (!grouped[w.category]) grouped[w.category] = [];
    grouped[w.category].push(w);
  });
  // Render categories as collapsible sections
  sidebar.innerHTML = Object.keys(grouped).map(cat => {
    const catId = `cat-${cat.replace(/[^a-z0-9]/gi, '')}`;
    return `
      <div class="workout-category-block mb-2">
        <div class="category-header d-flex justify-content-between align-items-center" data-cat="${catId}">
          <span><strong>${cat[0].toUpperCase() + cat.slice(1)}</strong></span>
          <span class="expand-icon">&#x25BC;</span>
        </div>
        <div class="category-workouts" id="${catId}" style="display:none;">
          ${grouped[cat].map(w =>
            `<div class="list-group-item workout-draggable workout-collapsible" data-id="${w.id}">
              <div class="d-flex justify-content-between align-items-center">
                <div><strong>${w.name}</strong></div>
                <span class="expand-icon">&#x25BC;</span>
              </div>
              <div class="workout-details" style="display:none;"></div>
            </div>`
          ).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Add click listeners for category expand/collapse
  sidebar.querySelectorAll('.category-header').forEach(header => {
    header.addEventListener('click', function() {
      const catId = header.dataset.cat;
      const container = document.getElementById(catId);
      const icon = header.querySelector('.expand-icon');
      if (container.style.display === 'none') {
        container.style.display = 'block';
        icon.innerHTML = '&#x25B2;';
      } else {
        container.style.display = 'none';
        icon.innerHTML = '&#x25BC;';
      }
    });
  });

  // Add click listeners for workout expand/collapse (details)
  sidebar.querySelectorAll('.workout-collapsible').forEach(block => {
    block.addEventListener('click', async function(e) {
      // Prevent drag if clicking inside details
      if (e.target.closest('.workout-details')) return;
      // Prevent category header click from triggering workout expand
      if (e.target.closest('.category-header')) return;
      const detailsDiv = block.querySelector('.workout-details');
      const icon = block.querySelector('.d-flex .expand-icon');
      if (detailsDiv.style.display === 'none') {
        detailsDiv.innerHTML = '<div class="text-muted">Loading...</div>';
        detailsDiv.style.display = 'block';
        if (icon) icon.innerHTML = '&#x25B2;';
        const workoutId = block.dataset.id;
        const details = await fetchWorkoutDetails(workoutId);
        if (!details.length) {
          detailsDiv.innerHTML = '<div class="text-danger">No exercises found.</div>';
        } else {
          detailsDiv.innerHTML = `<ul class="list-group list-group-flush">
            ${details.map(d =>
              `<li class="list-group-item py-1 px-2">
                <strong>${d.exercise?.name || 'Exercise'}</strong> - 
                ${d.sets} sets x ${d.reps} reps<br>
                <span class="text-muted">Rest: ${d.rest_seconds || 0}s</span>
              </li>`
            ).join('')}
          </ul>`;
        }
      } else {
        detailsDiv.style.display = 'none';
        if (icon) icon.innerHTML = '&#x25BC;';
      }
    });
  });
}

function renderProgramList() {
  // No-op: SortableJS manages DOM for program container
}

function getProgramWorkouts() {
  const items = Array.from(document.querySelectorAll('#programContainer .workout-draggable'));
  return items.map((el, i) => ({
    workout_id: el.dataset.id,
    order_index: i
  }));
}

function showAlert(msg, type='success') {
  const alertDiv = document.getElementById('programAlert');
  if (!alertDiv) return;
  alertDiv.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">${msg}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>`;
  alertDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => { alertDiv.innerHTML = ''; }, 4000);
}

async function init() {
  await loadWorkouts();
  renderSidebar();
  renderProgramList();

  // Setup SortableJS
  const sidebar = document.getElementById('workoutSidebar');
  const programContainer = document.getElementById('programContainer');

  // Make each category-workouts container a Sortable
  document.querySelectorAll('.category-workouts').forEach(catList => {
    Sortable.create(catList, {
      group: { name: 'workouts', pull: 'clone', put: true },
      sort: false,
      animation: 150,
      ghostClass: 'sortable-ghost',
      onAdd: function(evt) {
        // Remove any duplicate in sidebar
        const id = evt.item.dataset.id;
        catList.querySelectorAll('.workout-draggable').forEach(el => {
          if (el !== evt.item && el.dataset.id === id) el.remove();
        });
      },
      onEnd: evt => {}
    });
  });
  Sortable.create(programContainer, {
    group: { name: 'workouts', pull: true, put: true },
    animation: 150,
    ghostClass: 'sortable-ghost',
    onAdd: function (evt) {
      // Remove the workout from all category lists when added to program sequence
      const id = evt.item.dataset.id;
      document.querySelectorAll('.category-workouts .workout-draggable').forEach(el => {
        if (el.dataset.id === id) el.remove();
      });
    },
    onRemove: function(evt) {
      // If removed from program and dropped outside, remove from DOM
      if (!evt.to || !evt.to.classList.contains('category-workouts')) {
        evt.item.remove();
      }
    }
  });

  // Handle form submit
  document.getElementById('programForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('programName').value.trim();
    const description = document.getElementById('programDescription').value.trim();
    const workouts = getProgramWorkouts();
    if (!name) { showAlert('Enter a program name', 'danger'); return; }
    if (workouts.length === 0) { showAlert('Add at least one workout', 'danger'); return; }

    // get session for trainer id
    const { data: sessData, error: sessErr } = await db.auth.getSession();
    if (sessErr || !sessData.session) { showAlert('Not logged in', 'danger'); return; }
    const trainerId = sessData.session.user.id;

    // Insert program
    const { data: progData, error: progErr } = await db.from('programs').insert({
      created_by: trainerId,
      name,
      description
    }).select('id').single();
    if (progErr || !progData) { showAlert('Failed to create program: ' + (progErr?.message || ''), 'danger'); return; }
    const programId = progData.id;

    // Insert program_workouts
    const pwRecords = workouts.map(w => ({
      program_id: programId,
      workout_id: w.workout_id,
      order_index: w.order_index
    }));
    const { error: pwErr } = await db.from('program_workouts').insert(pwRecords);
    if (pwErr) { showAlert('Failed to save program workouts: ' + pwErr.message, 'danger'); return; }

    showAlert('Program created successfully!', 'success');
    document.getElementById('programForm').reset();
    document.getElementById('programContainer').innerHTML = '';
  });
}

document.addEventListener('DOMContentLoaded', init);
