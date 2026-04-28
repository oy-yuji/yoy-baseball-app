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

const AUTO_WORKOUT_PROGRAM_PREFIX = '__auto_workout__:';
const LEGACY_AUTO_WORKOUT_PREFIX = 'quick:';

const WORKOUT_COLOR_PALETTE = {
  blue: { solid: '#2563eb', soft: '#dbeafe', border: '#93c5fd', text: '#ffffff' },
  green: { solid: '#16a34a', soft: '#dcfce7', border: '#86efac', text: '#ffffff' },
  amber: { solid: '#d97706', soft: '#fef3c7', border: '#fcd34d', text: '#1f2937' },
  red: { solid: '#dc2626', soft: '#fee2e2', border: '#fecaca', text: '#ffffff' },
  purple: { solid: '#7c3aed', soft: '#ede9fe', border: '#c4b5fd', text: '#ffffff' },
  teal: { solid: '#0d9488', soft: '#ccfbf1', border: '#5eead4', text: '#ffffff' },
  pink: { solid: '#db2777', soft: '#fce7f3', border: '#f9a8d4', text: '#ffffff' },
  slate: { solid: '#475569', soft: '#e2e8f0', border: '#cbd5e1', text: '#ffffff' }
};

const CATEGORY_COLOR_KEYS = {
  warmup: 'amber',
  upper: 'blue',
  lower: 'green',
  pitching: 'purple',
  hitting: 'red',
  conditioning: 'teal',
  hybrid: 'pink',
  other: 'slate'
};

const COLOR_KEYS = Object.keys(WORKOUT_COLOR_PALETTE);

function normalizeCategory(category) {
  if (!category) return 'other';
  return String(category).toLowerCase();
}

function hashToIndex(value, modulo) {
  const str = String(value || '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulo;
}

function resolveColorKey(category, seed) {
  const seedValue = String(seed || '').trim();
  if (seedValue) return COLOR_KEYS[hashToIndex(seedValue, COLOR_KEYS.length)];
  const normalized = normalizeCategory(category);
  return CATEGORY_COLOR_KEYS[normalized] || 'slate';
}

function getWorkoutColorMeta(workout, fallbackName) {
  const category = workout?.category;
  const seed = workout?.name || fallbackName || workout?.id || category || '';
  const key = resolveColorKey(category, seed);
  return WORKOUT_COLOR_PALETTE[key] || WORKOUT_COLOR_PALETTE.slate;
}

function getWorkoutItemForDay(workoutItems, dayIndex) {
  const safeIndex = Number.isInteger(dayIndex) ? dayIndex : 0;
  if (!Array.isArray(workoutItems) || workoutItems.length === 0) return null;
  return workoutItems[safeIndex] || workoutItems[0] || null;
}

function buildEventColors(workoutItem, fallbackName) {
  const meta = getWorkoutColorMeta(workoutItem?.workout || workoutItem, fallbackName);
  return {
    backgroundColor: meta.solid,
    borderColor: meta.border,
    textColor: meta.text
  };
}

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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toIsoDateString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && value.start) return new Date(value.start).toISOString().slice(0, 10);
  return null;
}

function addDaysToIsoDate(dateStr, offset) {
  if (!dateStr) return null;
  const base = new Date(`${dateStr}T00:00:00`);
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

function diffIsoDates(dateStrA, dateStrB) {
  const a = new Date(`${dateStrA}T00:00:00`);
  const b = new Date(`${dateStrB}T00:00:00`);
  return Math.round((a - b) / 86400000);
}

function findContiguousBlock(dates, anchorDate) {
  if (!Array.isArray(dates) || !dates.length) return [];
  const sorted = Array.from(new Set(dates)).sort();
  const index = sorted.indexOf(anchorDate);
  if (index === -1) return [];

  let start = index;
  let end = index;
  while (start > 0 && diffIsoDates(sorted[start], sorted[start - 1]) === 1) {
    start -= 1;
  }
  while (end < sorted.length - 1 && diffIsoDates(sorted[end + 1], sorted[end]) === 1) {
    end += 1;
  }
  return sorted.slice(start, end + 1);
}

function cleanDisplayName(value, fallback = 'Program') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw
    .replace(new RegExp(`^${AUTO_WORKOUT_PROGRAM_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '')
    .replace(/^quick:\s*/i, '')
    .trim() || fallback;
}

function isAutoWorkoutProgramName(value) {
  return String(value || '').trim().toLowerCase().startsWith(AUTO_WORKOUT_PROGRAM_PREFIX);
}

function isAutoGeneratedWorkoutName(value) {
  return String(value || '').trim().toLowerCase().startsWith(LEGACY_AUTO_WORKOUT_PREFIX);
}

function dedupeProgramsByDisplayName(programs) {
  const seen = new Set();
  const out = [];
  for (const program of programs || []) {
    const displayName = cleanDisplayName(program?.name || 'Program', 'Program').toLowerCase();
    if (seen.has(displayName)) continue;
    seen.add(displayName);
    out.push(program);
  }
  return out;
}

function dedupeProgramWorkouts(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const workoutId = item?.workout?.id || 'none';
    const key = `${item?.order_index || 0}|${String(item?.day_label || '').toLowerCase()}|${workoutId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeProgramWorkoutList(items) {
  return dedupeProgramWorkouts(items)
    .slice()
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
}

function buildDayIndexByScheduleId(schedules) {
  const programDates = new Map();
  for (const schedule of schedules || []) {
    const programId = schedule?.program_id;
    const dateStr = toIsoDateString(schedule?.scheduled_date);
    if (!programId || !dateStr) continue;
    if (!programDates.has(programId)) programDates.set(programId, new Set());
    programDates.get(programId).add(dateStr);
  }

  const programDateIndex = new Map();
  for (const [programId, dateSet] of programDates.entries()) {
    const sortedDates = Array.from(dateSet).sort();
    let lastDate = null;
    let dayIndex = 0;
    for (const dateStr of sortedDates) {
      if (lastDate && diffIsoDates(dateStr, lastDate) === 1) {
        dayIndex += 1;
      } else {
        dayIndex = 0;
      }
      programDateIndex.set(`${programId}|${dateStr}`, dayIndex);
      lastDate = dateStr;
    }
  }

  const scheduleIndex = new Map();
  for (const schedule of schedules || []) {
    const programId = schedule?.program_id;
    const dateStr = toIsoDateString(schedule?.scheduled_date);
    if (!programId || !dateStr || !schedule?.id) continue;
    const key = `${programId}|${dateStr}`;
    if (programDateIndex.has(key)) {
      scheduleIndex.set(String(schedule.id), programDateIndex.get(key));
    }
  }

  return scheduleIndex;
}

function buildProgramEventTitle(programName, workoutItems, dayIndex, isAutoProgram = false) {
  if (!Array.isArray(workoutItems) || workoutItems.length === 0) return programName;
  const safeIndex = Number.isInteger(dayIndex) ? dayIndex : 0;
  const item = workoutItems[safeIndex] || workoutItems[0];
  const workoutName = item?.workout?.name || 'Workout';
  if (isAutoProgram) return workoutName;
  const dayLabel = item?.day_label || `Day ${safeIndex + 1}`;
  return `${programName} — ${dayLabel}: ${workoutName}`;
}

async function loadProgramSummary(programId, fallbackName) {
  if (!programId) {
    return { name: cleanDisplayName(fallbackName || 'Program', 'Program'), workouts: [], isAuto: false };
  }
  const { data, error } = await window.sb
    .from('programs')
    .select('id, name, program_workouts (order_index, day_label, workout:workouts (id, name, category))')
    .eq('id', programId)
    .single();

  if (error || !data) {
    return { name: cleanDisplayName(fallbackName || 'Program', 'Program'), workouts: [], isAuto: false };
  }

  return {
    name: cleanDisplayName(data.name || fallbackName || 'Program', 'Program'),
    workouts: normalizeProgramWorkoutList(data.program_workouts || []),
    isAuto: isAutoWorkoutProgramName(data.name)
  };
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
  sidebar.innerHTML = `
    <h4 style="font-size:1.1em">Schedule Blocks</h4>
    <div class="calendar-sidebar-section">
      <div class="calendar-sidebar-label">Programs</div>
      <input id="programSearch" class="form-control form-control-sm calendar-sidebar-search" placeholder="Search programs...">
      <div id="programList" class="calendar-sidebar-list"></div>
    </div>
    <div class="calendar-sidebar-section mb-0">
      <div class="calendar-sidebar-label">Workouts</div>
      <input id="workoutSearch" class="form-control form-control-sm calendar-sidebar-search" placeholder="Search workouts...">
      <div id="workoutList" class="calendar-sidebar-list"></div>
    </div>
  `;
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

  // Fetch trainer data for sidebar blocks
  const { data: sessData, error: sessErr } = await window.sb.auth.getSession();
  if (sessErr || !sessData.session) {
    sidebar.innerHTML = '<div class="alert alert-danger">Not logged in.</div>';
    return;
  }
  const trainerId = sessData.session.user.id;

  const [programResp, workoutResp] = await Promise.all([
    window.sb.from('programs').select('id, name').eq('created_by', trainerId),
    window.sb.from('workouts').select('id, name, category').eq('created_by', trainerId)
  ]);

  if (programResp.error || workoutResp.error) {
    sidebar.innerHTML = '<div class="alert alert-danger">Failed to load schedule blocks.</div>';
    return;
  }

  const allPrograms = dedupeProgramsByDisplayName((programResp.data || [])
    .filter((p) => !isAutoWorkoutProgramName(p.name))
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));

  const programNameSet = new Set(
    allPrograms
      .map((p) => cleanDisplayName(p.name || '', ''))
      .filter(Boolean)
      .map((name) => name.toLowerCase())
  );

  const allWorkouts = (workoutResp.data || [])
    .filter((w) => {
      const name = cleanDisplayName(w.name || '', '');
      if (!name) return false;
      if (isAutoGeneratedWorkoutName(w.name)) return false;
      // Keep program and workout panes strictly separated by display name.
      if (programNameSet.has(name.toLowerCase())) return false;
      return true;
    })
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const programList = document.getElementById('programList');
  const workoutList = document.getElementById('workoutList');
  const programSearch = document.getElementById('programSearch');
  const workoutSearch = document.getElementById('workoutSearch');

  const listState = {
    programQuery: '',
    workoutQuery: ''
  };

  function renderPrograms() {
    const q = listState.programQuery;
    const filtered = q
      ? allPrograms.filter((p) => String(p.name || '').toLowerCase().includes(q))
      : allPrograms;

    programList.innerHTML = filtered.length
      ? filtered.map((p) =>
        `<div class="program-draggable external-draggable list-group-item mb-2 calendar-program-chip" data-block-type="program" data-program-id="${p.id}">
          <strong>${escapeHtml(cleanDisplayName(p.name, 'Program'))}</strong>
        </div>`
      ).join('')
      : '<div class="small text-muted">No matching programs.</div>';

    document.querySelectorAll('.program-draggable').forEach((el) => {
      el.style.userSelect = 'none';
      el.addEventListener('click', async function(e) {
        if (e.defaultPrevented) return;
        let details = el.nextElementSibling;
        if (details && details.classList && details.classList.contains('program-details')) {
          details.style.display = (details.style.display === 'none' || !details.style.display) ? 'block' : 'none';
          return;
        }

        details = document.createElement('div');
        details.className = 'program-details';
        details.classList.add('calendar-program-details');
        details.innerHTML = '<div class="text-muted">Loading program...</div>';
        el.parentNode.insertBefore(details, el.nextSibling);

        const programId = el.dataset.programId;
        try {
          const { data, error } = await window.sb
            .from('programs')
            .select(`*, program_workouts (order_index, day_label, workout:workouts (id, name, category, workout_exercises (order_index, sets, reps, rest_seconds, exercise:exercises (id, name))))`)
            .eq('id', programId)
            .single();

          if (error || !data) {
            details.innerHTML = '<div class="text-danger">Failed to load program details.</div>';
            console.error('program load error', error);
            return;
          }

          const pw = dedupeProgramWorkouts((data.program_workouts || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
          const html = [];
          if (data.description) html.push(`<div class="mb-2">${escapeHtml(data.description)}</div>`);
          if (!pw.length) {
            html.push('<div class="text-muted">No workouts in this program.</div>');
          } else {
            html.push('<div>');
            pw.forEach((pwi) => {
              const w = pwi.workout || {};
              const prefix = pwi.day_label ? `${escapeHtml(pwi.day_label)} - ` : '';
              html.push(`<div style="margin-bottom:8px"><strong>${prefix}${escapeHtml(w.name || 'Workout')}</strong>`);
              const exercises = (w.workout_exercises || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
              if (exercises.length) {
                html.push('<ul style="margin:6px 0 0 18px;padding:0;">');
                exercises.forEach((ex) => {
                  const exName = ex.exercise?.name || 'Exercise';
                  html.push(`<li style="margin:2px 0">${escapeHtml(exName)} - ${escapeHtml(ex.sets || '')} sets ${escapeHtml(ex.reps || '')} <span class="text-muted">(rest ${escapeHtml(ex.rest_seconds || 0)}s)</span></li>`);
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
  }

  function renderWorkouts() {
    const q = listState.workoutQuery;
    const filtered = q
      ? allWorkouts.filter((w) => String(w.name || '').toLowerCase().includes(q))
      : allWorkouts;

    workoutList.innerHTML = filtered.length
      ? filtered.map((w) =>
        `<div class="external-draggable list-group-item mb-2 calendar-workout-chip" data-block-type="workout" data-workout-id="${w.id}">
          <div class="fw-semibold">${escapeHtml(w.name)}</div>
          <div class="small text-muted text-capitalize">${escapeHtml(w.category || 'other')}</div>
        </div>`
      ).join('')
      : '<div class="small text-muted">No matching workouts.</div>';
  }

  if (programSearch) {
    programSearch.addEventListener('input', () => {
      listState.programQuery = String(programSearch.value || '').trim().toLowerCase();
      renderPrograms();
    });
  }

  if (workoutSearch) {
    workoutSearch.addEventListener('input', () => {
      listState.workoutQuery = String(workoutSearch.value || '').trim().toLowerCase();
      renderWorkouts();
    });
  }

  renderPrograms();
  renderWorkouts();

  // Enable FullCalendar external drag for program/workout blocks
  if (window.FullCalendar && window.FullCalendar.Draggable) {
    new window.FullCalendar.Draggable(sidebar, {
      itemSelector: '.external-draggable',
      eventData: function(el) {
        const blockType = el.dataset.blockType || 'program';
        return {
          title: el.textContent.trim(),
          extendedProps: {
            blockType,
            programId: el.dataset.programId || null,
            workoutId: el.dataset.workoutId || null,
            exerciseId: el.dataset.exerciseId || null
          }
        };
      }
    });
  }

  async function createQuickProgramFromWorkout(workoutId, workoutName) {
    const visibleName = cleanDisplayName(workoutName, 'Workout');
    const quickProgramName = `${AUTO_WORKOUT_PROGRAM_PREFIX}${visibleName}`;
    const { data: pData, error: pErr } = await window.sb
      .from('programs')
      .insert({ created_by: trainerId, name: quickProgramName })
      .select('id, name')
      .single();
    if (pErr || !pData) throw new Error(pErr?.message || 'Failed to create quick program');

    const { error: pwErr } = await window.sb
      .from('program_workouts')
      .insert({ program_id: pData.id, workout_id: workoutId, order_index: 0, day_label: 'Day 1' });
    if (pwErr) throw new Error(pwErr.message || 'Failed to attach workout to quick program');

    return { programId: pData.id, title: visibleName };
  }

  async function insertSchedules(rows) {
    return window.sb
      .from('athlete_schedule')
      .insert(rows)
      .select('id, scheduled_date');
  }

  // Fetch athlete's scheduled programs
  const today = new Date();
  const { data: schedData, error: schedErr } = await window.sb.from('athlete_schedule').select('id, scheduled_date, program_id, programs(name)').eq('athlete_id', athleteId);
  const scheduleRows = schedData || [];
  const programIdsForSchedule = Array.from(new Set(scheduleRows.map(s => s.program_id).filter(Boolean)));
  let programDetails = [];
  if (programIdsForSchedule.length) {
    const { data } = await window.sb
      .from('programs')
      .select('id, name, program_workouts (order_index, day_label, workout:workouts (id, name, category))')
      .in('id', programIdsForSchedule);
    programDetails = data || [];
  }
  const programWorkoutsMap = new Map(
    (programDetails || []).map(p => [
      p.id,
      normalizeProgramWorkoutList(p.program_workouts || [])
    ])
  );
  const dayIndexMap = buildDayIndexByScheduleId(scheduleRows);

  const events = scheduleRows.map(s => {
    const programName = cleanDisplayName(s.programs?.name || 'Program', 'Program');
    const workoutItems = programWorkoutsMap.get(s.program_id) || [];
    const dayIndex = dayIndexMap.get(String(s.id));
    const isAuto = isAutoWorkoutProgramName(s.programs?.name || '');
    const dayWorkout = getWorkoutItemForDay(workoutItems, dayIndex);
    const colors = buildEventColors(dayWorkout, programName);
    return {
      id: s.id,
      title: buildProgramEventTitle(programName, workoutItems, dayIndex, isAuto),
      start: s.scheduled_date,
      extendedProps: {
        programId: s.program_id,
        scheduleId: s.id,
        dayIndex: dayIndex
      },
      allDay: true,
      backgroundColor: colors.backgroundColor,
      borderColor: colors.borderColor,
      textColor: colors.textColor
    };
  });

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
      const block = (info.event && info.event.extendedProps) || {};
      const blockType = block.blockType || 'program';
      const droppedDateCandidate = info.date || info.dateStr || (info.event && info.event.start) || null;
      if (!droppedDateCandidate) {
        showPageNotice('Failed to schedule program: No date selected.');
        try { info.event.remove(); } catch (e) {}
        return;
      }

      const dateStr = toIsoDateString(droppedDateCandidate);
      if (!dateStr) {
        showPageNotice('Failed to schedule program: Could not determine date string.');
        try { info.event.remove(); } catch (e) {}
        return;
      }

      let programId = block.programId || null;
      let fallbackName = cleanDisplayName(info.event?.title || info.draggedEl?.textContent || 'Program', 'Program');
      try {
        if (blockType === 'workout') {
          const sourceName = cleanDisplayName(info.draggedEl?.querySelector('.fw-semibold')?.textContent || info.event.title || 'Workout', 'Workout');
          const quick = await createQuickProgramFromWorkout(block.workoutId, sourceName);
          programId = quick.programId;
          fallbackName = quick.title || sourceName;
          info.event.setProp('title', fallbackName);
        }
      } catch (createErr) {
        showPageNotice(`Failed to prepare schedule: ${createErr.message}`);
        info.event.remove();
        return;
      }
      const summary = await loadProgramSummary(programId, fallbackName);
      const workoutItems = summary.workouts.length
        ? summary.workouts
        : [{ day_label: 'Day 1', workout: { name: 'Workout' } }];

      const scheduleRowsToInsert = workoutItems.map((item, idx) => ({
        athlete_id: athleteId,
        program_id: programId,
        scheduled_date: addDaysToIsoDate(dateStr, idx),
        assigned_by: trainerId
      }));

      const { data: insertData, error } = await insertSchedules(scheduleRowsToInsert);
      if (error || !insertData) {
        showPageNotice('Failed to schedule program: ' + (error?.message || 'unknown'));
        info.event.remove();
        return;
      }

      const insertedByDate = new Map(
        (insertData || []).map(row => [toIsoDateString(row.scheduled_date), row.id])
      );

      info.event.remove();

      workoutItems.forEach((item, idx) => {
        const eventDate = addDaysToIsoDate(dateStr, idx);
        const scheduleId = insertedByDate.get(eventDate);
        const colors = buildEventColors(item, summary.name);
        calendar.addEvent({
          id: scheduleId || undefined,
          title: buildProgramEventTitle(summary.name, workoutItems, idx, summary.isAuto),
          start: eventDate,
          allDay: true,
          extendedProps: {
            programId: programId,
            scheduleId: scheduleId,
            dayIndex: idx
          },
          backgroundColor: colors.backgroundColor,
          borderColor: colors.borderColor,
          textColor: colors.textColor
        });
      });
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
      // Delete handler (deletes all contiguous program days and removes events)
      card.querySelector('#pc-delete').addEventListener('click', async function() {
        const ok = await confirmDialog('Delete this scheduled program?', 'Delete Schedule');
        if (!ok) return;
        const scheduleId = info.event && (info.event.extendedProps && (info.event.extendedProps.scheduleId || info.event.id));
        if (!scheduleId) {
          showPageNotice('Cannot delete: missing schedule id');
          return;
        }
        const scheduleDate = toIsoDateString(info.event?.start);
        const programId = info.event?.extendedProps?.programId;

        if (!scheduleDate || !programId) {
          const { error } = await window.sb.from('athlete_schedule').delete().eq('id', scheduleId);
          if (error) {
            showPageNotice('Failed to delete schedule: ' + error.message);
            return;
          }
          info.event.remove();
          backdrop.remove();
          return;
        }

        const { data: programSchedules, error: listErr } = await window.sb
          .from('athlete_schedule')
          .select('id, scheduled_date')
          .eq('athlete_id', athleteId)
          .eq('program_id', programId);

        if (listErr) {
          showPageNotice('Failed to load program schedule: ' + listErr.message);
          return;
        }

        const dateList = (programSchedules || [])
          .map(row => toIsoDateString(row.scheduled_date))
          .filter(Boolean);
        const blockDates = findContiguousBlock(dateList, scheduleDate);
        const deleteIds = (programSchedules || [])
          .filter(row => blockDates.includes(toIsoDateString(row.scheduled_date)))
          .map(row => row.id);

        if (!deleteIds.length) {
          showPageNotice('No matching block to delete.', 'warning');
          return;
        }

        const { error } = await window.sb.from('athlete_schedule').delete().in('id', deleteIds);
        if (error) {
          showPageNotice('Failed to delete schedule: ' + error.message);
          return;
        }

        info.event.remove();
        calendar.getEvents().forEach((ev) => {
          if (deleteIds.includes(ev.extendedProps?.scheduleId || ev.id)) {
            ev.remove();
          }
        });
        backdrop.remove();
      });

      try {
        const { data, error } = await window.sb.from('programs').select(`*, program_workouts (order_index, day_label, workout:workouts (id, name, category, workout_exercises (order_index, sets, reps, rest_seconds, exercise:exercises (id, name))))`).eq('id', programId).single();
        const body = card.querySelector('#pc-body');
        if (error || !data) {
          body.innerHTML = '<div class="text-danger">Failed to load program details.</div>';
          console.error('program load error', error);
          return;
        }
        const pw = dedupeProgramWorkouts((data.program_workouts || []).sort((a,b) => (a.order_index||0) - (b.order_index||0)));
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
