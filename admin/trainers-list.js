async function loadTrainers(){
  const alertContainer = document.getElementById('alertContainer');
  const showAlert = (msg) => { if (alertContainer) alertContainer.textContent = msg; else console.log(msg); };

  if (!window.sb) {
    showAlert('Supabase client not initialized. Make sure /js/supabase.js is included before this script.');
    console.error('window.sb is undefined');
    return;
  }

  try {
    const resp = await window.sb
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'trainer');
    const { data: users, error } = resp;
    console.log('Supabase response:', resp);

    if (error) {
      showAlert('Failed to load trainers: ' + error.message);
      console.error('Supabase error', error);
      return;
    }

    if (!users || users.length === 0) {
      showAlert('No trainers found. Check Supabase "users" table, role values, and RLS policies.');
      console.log('No users returned. Raw response:', resp);
      return;
    }

    const tbody = document.getElementById('trainersTableBody');
    if (!tbody) {
      console.error('trainersTableBody not found in DOM');
      return;
    }
    tbody.innerHTML = '';
    users.forEach(user => {
      const row = document.createElement('tr');
      // make name clickable to load athletes
      const name = user.full_name || '';
      const email = user.email || '';
      const nameTd = document.createElement('td');
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'trainer-link';
      link.dataset.id = user.id || '';
      link.textContent = name;
      nameTd.appendChild(link);

      const emailTd = document.createElement('td');
      emailTd.textContent = email;

      row.appendChild(nameTd);
      row.appendChild(emailTd);
      tbody.appendChild(row);
    });

    // attach click handler (delegation) to redirect to trainer page
    document.querySelector('#trainersTable').addEventListener('click', function (e) {
      const a = e.target.closest('.trainer-link');
      if (!a) return;
      e.preventDefault();
      const trainerId = a.dataset.id;
      const trainerName = a.textContent;
      // redirect to trainer-athletes page with trainer id in query
      const params = new URLSearchParams({ trainer_id: trainerId, trainer_name: trainerName });
      window.location.href = `trainer-athletes.html?${params.toString()}`;
    });
    // clear any previous alerts on success
    if (alertContainer) alertContainer.textContent = '';
  } catch (e) {
    showAlert('Error loading trainers: ' + (e.message || e));
    console.error(e);
  }


// Load athletes for a given trainer id and render into athletes table
async function loadAthletes(trainerId, trainerName) {
  const alertContainer = document.getElementById('alertContainer');
  const showAlert = (msg) => { if (alertContainer) alertContainer.textContent = msg; else console.log(msg); };
  if (!window.sb) { showAlert('Supabase client not initialized.'); return; }
  try {
    const resp = await window.sb
      .from('athletes')
      .select('id, position, height_cm, weight_lbs, birthday, throwing_side, batting_side, users(full_name,email)')
      .eq('trainer_id', trainerId);
    console.log('Athletes response:', resp);
    if (resp.error) { showAlert('Failed to load athletes: ' + resp.error.message); console.error(resp.error); return; }
    const athletes = resp.data || [];
    const section = document.getElementById('athletesSection');
    const headingName = document.getElementById('selectedTrainerName');
    const tbody = document.getElementById('athletesTableBody');
    if (!section || !tbody || !headingName) { console.error('Athletes DOM elements missing'); return; }
    headingName.textContent = trainerName;
    tbody.innerHTML = '';
    if (athletes.length === 0) {
      showAlert('No athletes found for this trainer.');
    } else {
      athletes.forEach(a => {
        const user = a.users || {};
        const row = document.createElement('tr');
        const fields = [
          user.full_name || '',
          user.email || '',
          a.position || '',
          a.height_cm || '',
          a.weight_lbs || '',
          a.birthday || ''
        ];
        fields.forEach((value) => {
          const td = document.createElement('td');
          td.textContent = String(value);
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
      // clear alert
      if (alertContainer) alertContainer.textContent = '';
    }
    section.style.display = '';
    // scroll to athletes section
    section.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showAlert('Error loading athletes: ' + (err.message || err));
    console.error(err);
  }
}

// Close athletes section
document.addEventListener('click', function (e) {
  if (e.target && e.target.id === 'closeAthletes') {
    const section = document.getElementById('athletesSection');
    if (section) section.style.display = 'none';
  }
});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadTrainers);
} else {
  loadTrainers(); 
}