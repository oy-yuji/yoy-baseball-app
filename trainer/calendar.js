// Calendar page logic for trainer/athlete scheduling
// Uses FullCalendar (https://fullcalendar.io/) for calendar UI and drag-and-drop
// Assumes Supabase client is available as window.sb

// Load FullCalendar CSS/JS
const calendarCss = document.createElement('link');
calendarCss.rel = 'stylesheet';
calendarCss.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/main.min.css';
document.head.appendChild(calendarCss);
const calendarScript = document.createElement('script');
calendarScript.src = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js';
document.head.appendChild(calendarScript);

function getNotifyHost() {
  let host = document.getElementById('pageNotifyHost');
  if (host) return host;
  host = document.createElement('div');
  host.id = 'pageNotifyHost';
  host.style.position = 'fixed';
  host.style.right = '16px';
  host.style.bottom = '16px';
  host.style.zIndex = '11000';
  host.style.width = 'min(92vw, 380px)';
  document.body.appendChild(host);
  return host;
}

function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function styleNoticeForTheme(note, type) {
  if (!isDarkTheme()) return;

  const palette = {
    success: { bg: '#052e1f', border: '#14532d', text: '#bbf7d0' },
    warning: { bg: '#3f2a06', border: '#7c5a10', text: '#fde68a' },
    danger: { bg: '#3f1418', border: '#7f1d1d', text: '#fecaca' },
    info: { bg: '#0b2f45', border: '#1e3a8a', text: '#bfdbfe' }
  };
  const chosen = palette[type] || palette.danger;
  note.style.background = chosen.bg;
  note.style.border = `1px solid ${chosen.border}`;
  note.style.color = chosen.text;
}

function showPageNotice(message, type = 'danger') {
  const host = getNotifyHost();
  const note = document.createElement('div');
  note.className = `alert alert-${type} shadow-sm mb-2`;
  note.role = 'alert';
  note.innerHTML = `${message}`;
  styleNoticeForTheme(note, type);
  host.appendChild(note);
  window.setTimeout(() => note.remove(), 3500);
}

function confirmDialog(message, title = 'Confirm Action') {
  return new Promise((resolve) => {
    const dark = isDarkTheme();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop show';
    backdrop.style.zIndex = '10998';

    const dialog = document.createElement('div');
    dialog.className = 'position-fixed top-50 start-50 translate-middle border rounded-3 shadow p-3';
    dialog.style.zIndex = '10999';
    dialog.style.width = 'min(92vw, 440px)';
    dialog.style.backgroundColor = '#ffffff';
    dialog.style.color = '#0f172a';
    dialog.style.borderColor = '#d1d5db';
    if (dark) {
      dialog.style.backgroundColor = '#111827';
      dialog.style.borderColor = '#334155';
      dialog.style.color = '#e2e8f0';
    }
    dialog.innerHTML = `
      <h5 class="mb-2">${title}</h5>
      <p class="mb-3">${message}</p>
      <div class="d-flex justify-content-end gap-2">
        <button type="button" class="btn btn-outline-secondary" id="confirmNoBtn">Cancel</button>
        <button type="button" class="btn btn-danger" id="confirmYesBtn">Delete</button>
      </div>
    `;

    const finish = (result) => {
      dialog.remove();
      backdrop.remove();
      resolve(result);
    };

    dialog.querySelector('#confirmNoBtn').addEventListener('click', () => finish(false));
    dialog.querySelector('#confirmYesBtn').addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', () => finish(false));

    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
  });
}

// Wait for FullCalendar to load
calendarScript.onload = async function() {
  // Get athlete id from URL
  const params = new URLSearchParams(location.search);
  const athleteId = params.get('athlete');
  if (!athleteId) {
    document.body.innerHTML = '<div class="alert alert-danger">No athlete selected.</div>';
    return;
  }

  // Inject shared navbar (same as other pages)
  const navHtml = `
    <nav id="siteNavbar" class="navbar navbar-expand-lg navbar-dark bg-secondary" style="position:fixed;top:0;width:100%;z-index:1000;">
      <div class="container-fluid">
        <a class="navbar-brand" href="#">Baseball App</a>
        <div class="d-flex align-items-center">
          <span id="userNavbarName" class="text-light me-3" style="font-size:1rem;"></span>
          <button id="logoutBtn" class="btn btn-outline-light ms-2">Logout</button>
        </div>
      </div>
    </nav>
  `;
  document.body.insertAdjacentHTML('afterbegin', navHtml);
  // spacer so page content sits below fixed navbar
  const navSpacer = document.createElement('div');
  navSpacer.style.height = '56px';
  document.body.insertBefore(navSpacer, document.body.children[1]);
  // load navbar helper script to populate user info and handlers
  const navbarScript = document.createElement('script');
  navbarScript.src = '../js/navbar.js';
  document.head.appendChild(navbarScript);

  // Sidebar for programs
  const sidebar = document.createElement('div');
  sidebar.id = 'programSidebar';
  sidebar.className = 'calendar-program-sidebar';
  sidebar.innerHTML = '<h4 style="font-size:1.1em">Programs</h4><div id="programList"></div>';
  document.body.appendChild(sidebar);

  // Calendar container
  const calDiv = document.createElement('div');
  calDiv.id = 'calendarContainer';
  calDiv.style = 'padding:24px 0;';

  // Create a wrapper for header + calendar so header isn't obscured by FullCalendar
  const wrapper = document.createElement('div');
  wrapper.id = 'calendarWrapper';
  wrapper.className = 'calendar-wrapper';
  // append wrapper to body and move calendar into it
  document.body.appendChild(wrapper);
  wrapper.appendChild(calDiv);

  // Render athlete name header (inserted into wrapper above calendar)
  try {
    const { data: athleteUser, error: athleteErr } = await window.sb.from('users').select('full_name').eq('id', athleteId).single();
    const athleteName = (athleteUser && athleteUser.full_name) ? athleteUser.full_name : '';
    const header = document.createElement('div');
    header.id = 'calendarHeader';
    header.className = 'calendar-header';
    header.innerHTML = `<div class="d-flex justify-content-between align-items-center gap-2"><div class="fw-semibold">${athleteName || 'Athlete Calendar'}</div><a href="athletes.html" class="btn btn-sm btn-outline-secondary">Back to Athletes</a></div>`;
    wrapper.insertBefore(header, calDiv);
  } catch (e) {
    console.error('Failed to load athlete name', e);
  }

  // Fetch trainer's programs
  const { data: sessData, error: sessErr } = await window.sb.auth.getSession();
  if (sessErr || !sessData.session) {
    sidebar.innerHTML = '<div class="alert alert-danger">Not logged in.</div>';
    return;
  }
  const trainerId = sessData.session.user.id;
  const { data: progData, error: progErr } = await window.sb.from('programs').select('id, name').eq('created_by', trainerId);
  if (progErr) {
    sidebar.innerHTML = '<div class="alert alert-danger">Failed to load programs.</div>';
    return;
  }

  // Render programs as draggable blocks (for FullCalendar external drag)
  const progList = document.getElementById('programList');
  progList.innerHTML = progData.map(p =>
    `<div class="program-draggable list-group-item mb-2 calendar-program-chip" data-id="${p.id}">
      <strong>${p.name}</strong>
    </div>`
  ).join('');

  // Enable FullCalendar external drag
  if (window.FullCalendar && window.FullCalendar.Draggable) {
    new window.FullCalendar.Draggable(progList, {
      itemSelector: '.program-draggable',
      eventData: function(el) {
        return {
          title: el.textContent.trim(),
          extendedProps: { programId: el.dataset.id }
        };
      }
    });
  }

  // Attach click handlers to show program contents inline
  document.querySelectorAll('.program-draggable').forEach(el => {
    el.style.userSelect = 'none';
    el.addEventListener('click', async function(e) {
      // Prevent click when dragging
      if (e.defaultPrevented) return;
      // Toggle existing details container
      let details = el.nextElementSibling;
      if (details && details.classList && details.classList.contains('program-details')) {
        if (details.style.display === 'none' || !details.style.display) {
          details.style.display = 'block';
        } else {
          details.style.display = 'none';
        }
        return;
      }
      // Create details container
      details = document.createElement('div');
      details.className = 'program-details';
      details.classList.add('calendar-program-details');
      details.innerHTML = '<div class="text-muted">Loading program...</div>';
      el.parentNode.insertBefore(details, el.nextSibling);

      const programId = el.dataset.id;
      try {
        const { data, error } = await window.sb.from('programs').select(`*, program_workouts (order_index, day_label, workout:workouts (id, name, category, workout_exercises (order_index, sets, reps, rest_seconds, exercise:exercises (id, name))))`).eq('id', programId).single();
        if (error || !data) {
          details.innerHTML = '<div class="text-danger">Failed to load program details.</div>';
          console.error('program load error', error);
          return;
        }
        const pw = (data.program_workouts || []).sort((a,b) => (a.order_index||0) - (b.order_index||0));
        const html = [];
        if (data.description) html.push(`<div class="mb-2">${data.description}</div>`);
        if (!pw.length) {
          html.push('<div class="text-muted">No workouts in this program.</div>');
        } else {
          html.push('<div>');
          pw.forEach((pwi, idx) => {
            const w = pwi.workout || {};
            const prefix = pwi.day_label ? `${pwi.day_label} — ` : '';
            html.push(`<div style="margin-bottom:8px"><strong>${prefix}${w.name || 'Workout'}</strong>`);
            const exercises = (w.workout_exercises || []).sort((a,b) => (a.order_index||0) - (b.order_index||0));
            if (exercises.length) {
              html.push('<ul style="margin:6px 0 0 18px;padding:0;">');
              exercises.forEach(ex => {
                const exName = ex.exercise?.name || 'Exercise';
                html.push(`<li style="margin:2px 0">${exName} — ${ex.sets || ''} sets ${ex.reps || ''} <span class="text-muted">(rest ${ex.rest_seconds||0}s)</span></li>`);
              });
              html.push('</ul>');
            } else {
              html.push('<div class="text-muted">No exercises listed for this workout.</div>');
            }
            html.push('</div>');
          });
          html.push('</div>');
        }
        details.innerHTML = html.join('');
      } catch (err) {
        details.innerHTML = '<div class="text-danger">Error loading program.</div>';
        console.error(err);
      }
    });
  });

  // Fetch athlete's scheduled programs
  const today = new Date();
  const { data: schedData, error: schedErr } = await window.sb.from('athlete_schedule').select('id, scheduled_date, program_id, programs(name)').eq('athlete_id', athleteId);
  const events = (schedData || []).map(s => ({
    id: s.id,
    title: s.programs?.name || 'Program',
    start: s.scheduled_date,
    extendedProps: { programId: s.program_id },
    allDay: true
  }));

  // Render FullCalendar
  const calendar = new window.FullCalendar.Calendar(calDiv, {
    initialView: 'dayGridMonth',
    height: 'auto',
    events,
    droppable: true,
    editable: true,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: ''
    },
    dateClick: function(info) {
      // Optionally: highlight date
    },
    eventReceive: async function(info) {
      // This fires when a program is dropped onto a date
      const programId = (info.draggedEl && info.draggedEl.dataset && info.draggedEl.dataset.id) || (info.event && info.event.extendedProps && info.event.extendedProps.programId) || null;
      // Try multiple sources for the dropped date: info.date, info.dateStr, or event.start
      const droppedDateCandidate = info.date || info.dateStr || (info.event && info.event.start) || null;
      if (!droppedDateCandidate) {
        showPageNotice('Failed to schedule program: No date selected.');
        try { info.event.remove(); } catch (e) {}
        return;
      }
      // Normalize to YYYY-MM-DD string
      let dateStr = null;
      if (typeof droppedDateCandidate === 'string') {
        dateStr = droppedDateCandidate;
      } else if (droppedDateCandidate instanceof Date) {
        dateStr = droppedDateCandidate.toISOString().slice(0,10);
      } else if (droppedDateCandidate && droppedDateCandidate.start) {
        dateStr = new Date(droppedDateCandidate.start).toISOString().slice(0,10);
      }
      if (!dateStr) {
        showPageNotice('Failed to schedule program: Could not determine date string.');
        try { info.event.remove(); } catch (e) {}
        return;
      }
      // Insert athlete_schedule with assigned_by for RLS and capture DB id
      const { data: insertData, error } = await window.sb.from('athlete_schedule').insert({
        athlete_id: athleteId,
        program_id: programId,
        scheduled_date: dateStr,
        assigned_by: trainerId
      }).select('id').single();
      if (error || !insertData) {
        showPageNotice('Failed to schedule program: ' + (error?.message || 'unknown'));
        info.event.remove();
      } else {
        // store DB schedule id on the event for future updates/deletes
        try { info.event.setExtendedProp('scheduleId', insertData.id); } catch (e) { info.event.setExtendedProp && info.event.setExtendedProp('scheduleId', insertData.id); }
        info.event.setProp('title', info.draggedEl.textContent.trim());
      }
    }
    ,
    eventDrop: async function(info) {
      // Fired when an existing event is dragged to a new date
      const ev = info.event;
      const scheduleId = ev.extendedProps && (ev.extendedProps.scheduleId || ev.id);
      if (!scheduleId) {
        showPageNotice('Cannot reschedule: no schedule id');
        info.revert();
        return;
      }
      // Determine new date
      const newDate = ev.start;
      if (!newDate) { info.revert(); return; }
      const newDateStr = newDate.toISOString().slice(0,10);
      const { error } = await window.sb.from('athlete_schedule').update({ scheduled_date: newDateStr }).eq('id', scheduleId);
      if (error) {
        showPageNotice('Failed to reschedule: ' + error.message);
        info.revert();
      }
    }
    ,
    eventClick: async function(info) {
      // Show program details in modal when calendar event is clicked
      const programId = info.event && info.event.extendedProps && info.event.extendedProps.programId;
      if (!programId) {
        showPageNotice('Program details not available for this event.', 'warning');
        return;
      }
      // create modal backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'program-modal-backdrop';
      const card = document.createElement('div');
      card.className = 'program-modal-card';
      card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h4 class="m-0">Program Details</h4><div><button id="pc-delete" class="btn btn-sm btn-danger me-2">Delete</button><button id="pc-close" class="btn btn-sm btn-outline-secondary">Close</button></div></div><div id="pc-body"><div class="text-muted">Loading...</div></div>';
      backdrop.appendChild(card);
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', function(e){ if (e.target === backdrop) backdrop.remove(); });
      card.querySelector('#pc-close').addEventListener('click', () => backdrop.remove());
      // Delete handler (deletes athlete_schedule row and removes event)
      card.querySelector('#pc-delete').addEventListener('click', async function() {
        const ok = await confirmDialog('Delete this scheduled program?', 'Delete Schedule');
        if (!ok) return;
        const scheduleId = info.event && (info.event.extendedProps && (info.event.extendedProps.scheduleId || info.event.id));
        if (!scheduleId) {
          showPageNotice('Cannot delete: missing schedule id');
          return;
        }
        const { error } = await window.sb.from('athlete_schedule').delete().eq('id', scheduleId);
        if (error) {
          showPageNotice('Failed to delete schedule: ' + error.message);
        } else {
          info.event.remove();
          backdrop.remove();
        }
      });

      try {
        const { data, error } = await window.sb.from('programs').select(`*, program_workouts (order_index, day_label, workout:workouts (id, name, category, workout_exercises (order_index, sets, reps, rest_seconds, exercise:exercises (id, name))))`).eq('id', programId).single();
        const body = card.querySelector('#pc-body');
        if (error || !data) {
          body.innerHTML = '<div class="text-danger">Failed to load program details.</div>';
          console.error('program load error', error);
          return;
        }
        const pw = (data.program_workouts || []).sort((a,b) => (a.order_index||0) - (b.order_index||0));
        const html = [];
        if (data.description) html.push(`<div class="mb-2">${data.description}</div>`);
        if (!pw.length) {
          html.push('<div class="text-muted">No workouts in this program.</div>');
        } else {
          html.push('<div>');
          pw.forEach((pwi, idx) => {
            const w = pwi.workout || {};
            const prefix = pwi.day_label ? `${pwi.day_label} — ` : '';
            html.push(`<div style="margin-bottom:8px"><strong>${prefix}${w.name || 'Workout'}</strong>`);
            const exercises = (w.workout_exercises || []).sort((a,b) => (a.order_index||0) - (b.order_index||0));
            if (exercises.length) {
              html.push('<ul style="margin:6px 0 0 18px;padding:0;">');
              exercises.forEach(ex => {
                const exName = ex.exercise?.name || 'Exercise';
                html.push(`<li style="margin:2px 0">${exName} — ${ex.sets || ''} sets ${ex.reps || ''} <span class="text-muted">(rest ${ex.rest_seconds||0}s)</span></li>`);
              });
              html.push('</ul>');
            } else {
              html.push('<div class="text-muted">No exercises listed for this workout.</div>');
            }
            html.push('</div>');
          });
          html.push('</div>');
        }
        body.innerHTML = html.join('');
      } catch (err) {
        const body = card.querySelector('#pc-body');
        body.innerHTML = '<div class="text-danger">Error loading program.</div>';
        console.error(err);
      }
    }
  });
  calendar.render();
};
