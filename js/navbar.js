// Communal navbar injection and logout handler

async function renderNavbar() {
  // Populate inlined navbar (if present) with user info and attach handlers
  const { data } = await sb.auth.getUser();
  const id = data.user ? data.user.id : '';
  let fullName = '';
  if (id) {
    const { data: userRow, error } = await sb
      .from('users')
      .select('full_name')
      .eq('id', id)
      .single();
    if (userRow && userRow.full_name) fullName = userRow.full_name;
  }
  const displayName = fullName || id;

  // Populate both navbar and page display elements if present
  const userNavbarSpan = document.getElementById('userNavbarName');
  if (userNavbarSpan) userNavbarSpan.textContent = displayName;
  const pageFullName = document.getElementById('userFullName');
  if (pageFullName) pageFullName.textContent = displayName;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      await sb.auth.signOut();
      window.location.href = '../index.html';
    });
  }
}

// Render navbar if user is logged in
sb.auth.getUser().then(({ data }) => {
  if (data.user) renderNavbar();
});
