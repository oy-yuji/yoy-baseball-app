document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('exerciseForm');
  if (!form) return;

  // Insert alert container above the form
  const card = form.closest('.card');
  let alertDiv = document.createElement('div');
  alertDiv.id = 'exerciseAlert';
  card.insertBefore(alertDiv, form);

  const showAlert = (msg, type = 'success') => {
    alertDiv.innerHTML = `
      <div class="alert alert-${type} alert-dismissible fade show" role="alert">
        ${msg}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      </div>
    `;
  };

  // Get Supabase client
  const db = window.sb || window.db;
  if (!db) {
    showAlert('Supabase client not found.', 'danger');
    return;
  }

  // Get logged-in trainer ID
  let session;
  try {
    const { data, error } = await db.auth.getSession();
    if (error || !data.session) {
      showAlert('You must be logged in.', 'danger');
      window.location.href = '../index.html';
      return;
    }
    session = data.session;
  } catch (e) {
    showAlert('Error checking session.', 'danger');
    return;
  }
  const trainerId = session.user.id;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const category = form.category.value;
    const demo_video_url = form.demo_video_url.value.trim();
    const notes = form.notes.value.trim();

    const { error } = await db.from('exercises').insert({
      created_by: trainerId,
      name,
      category,
      demo_video_url,
      notes
    });

    if (error) {
      showAlert('Failed to add exercise: ' + error.message, 'danger');
    } else {
      showAlert('Exercise added!', 'success');
      form.reset();
    }
  });
});