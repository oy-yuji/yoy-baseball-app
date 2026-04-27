document.addEventListener('DOMContentLoaded', async () => {
  const CATEGORY_FALLBACKS = {
    plyometric: ['plyometric', 'hybrid', 'plyometrics', 'plyo'],
    hybrid: ['hybrid', 'plyometric', 'plyometrics', 'plyo']
  };

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
    const categoryInput = form.querySelector('[name="category"]');
    const rawCategory = (categoryInput?.value || '').trim().toLowerCase();
    const demo_video_url = form.demo_video_url.value.trim();
    const notes = form.notes.value.trim();

    const categoryCandidates = Array.from(new Set([
      ...(CATEGORY_FALLBACKS[rawCategory] || [rawCategory]),
      rawCategory,
      'other'
    ].filter(Boolean)));

    let error = null;
    let insertedCategory = '';
    for (const category of categoryCandidates) {
      const result = await db.from('exercises').insert({
        created_by: trainerId,
        name,
        category,
        demo_video_url,
        notes
      });

      if (!result.error) {
        error = null;
        insertedCategory = category;
        break;
      }

      error = result.error;
      const maybeCategoryConstraint = /category_check|violates check constraint/i.test(String(error?.message || ''));
      if (!maybeCategoryConstraint) break;
    }

    // Last-resort fallback: let DB default category apply (if configured).
    if (error && /category_check|violates check constraint/i.test(String(error?.message || ''))) {
      const defaultCategoryInsert = await db.from('exercises').insert({
        created_by: trainerId,
        name,
        demo_video_url,
        notes
      });

      if (!defaultCategoryInsert.error) {
        error = null;
        insertedCategory = '(db default)';
      } else {
        error = defaultCategoryInsert.error;
      }
    }

    if (error) {
      console.error('Add exercise failed', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        attemptedCategories: categoryCandidates
      });

      const detailParts = [error.message, error.details, error.hint].filter(Boolean);
      showAlert('Failed to add exercise: ' + detailParts.join(' | '), 'danger');
    } else {
      const usedFallbackCategory = insertedCategory && insertedCategory !== rawCategory;
      if (usedFallbackCategory) {
        showAlert(`Exercise added. Category saved as ${insertedCategory}.`, 'warning');
      } else {
        showAlert('Exercise added!', 'success');
      }
      form.reset();
    }
  });
});