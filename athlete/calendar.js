// Athlete calendar: load FullCalendar and render this athlete's scheduled programs
const fcCss = document.createElement('link');
fcCss.rel = 'stylesheet';
fcCss.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/main.min.css';
document.head.appendChild(fcCss);
const fcScript = document.createElement('script');
fcScript.src = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js';
document.head.appendChild(fcScript);

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

function cleanDisplayName(value, fallback = 'Program') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw
    .replace(new RegExp(`^${AUTO_WORKOUT_PROGRAM_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '')
    .replace(new RegExp(`^${LEGACY_AUTO_WORKOUT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '')
    .trim() || fallback;
}

function toIsoDateString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}

function diffIsoDates(dateStrA, dateStrB) {
  const a = new Date(`${dateStrA}T00:00:00`);
  const b = new Date(`${dateStrB}T00:00:00`);
  return Math.round((a - b) / 86400000);
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

function normalizeProgramWorkoutList(items) {
  return (items || [])
    .slice()
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
}

function buildProgramEventTitle(programName, workoutItems, dayIndex) {
  if (!Array.isArray(workoutItems) || workoutItems.length === 0) return programName;
  const safeIndex = Number.isInteger(dayIndex) ? dayIndex : 0;
  const item = workoutItems[safeIndex] || workoutItems[0];
  const dayLabel = item?.day_label || `Day ${safeIndex + 1}`;
  const workoutName = item?.workout?.name || 'Workout';
  return `${programName} — ${dayLabel}: ${workoutName}`;
}

fcScript.onload = async function() {
  // get athlete id from query or from session -> athletes table
  const params = new URLSearchParams(location.search);
  let athleteId = params.get('athlete');

  // ensure supabase client available
  if (!window.sb) {
    console.error('Supabase client not found');
    return;
  }

  if (!athleteId) {
    try {
      const { data: sess } = await window.sb.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (uid) {
        const { data: a, error } = await window.sb.from('athletes').select('id').eq('user_id', uid).maybeSingle();
        if (!error && a && a.id) athleteId = a.id;
      }
    } catch (e) { console.error(e); }
  }

  if (!athleteId) {
    document.getElementById('calendarContainer').innerHTML = '<div class="alert alert-danger">No athlete selected.</div>';
    return;
  }

  // show header
  try {
    const { data: u } = await window.sb.from('users').select('full_name').eq('id', athleteId).single();
    const name = u?.full_name || 'Athlete Calendar';
    document.getElementById('calendarHeader').innerHTML = `<div class="d-flex justify-content-between align-items-center"><h4 class="m-0">${name}</h4><a class="btn btn-sm btn-outline-secondary" href="dashboard.html">Back</a></div>`;
  } catch (e) { console.error(e); }

  // fetch schedules
  const { data: sched, error: schedErr } = await window.sb.from('athlete_schedule').select('id, scheduled_date, program_id, programs(name)').eq('athlete_id', athleteId);
  if (schedErr) {
    document.getElementById('calendarContainer').innerHTML = '<div class="alert alert-danger">Failed to load schedule.</div>';
    console.error(schedErr);
    return;
  }

  const scheduleRows = sched || [];
  const programIds = Array.from(new Set(scheduleRows.map(s => s.program_id).filter(Boolean)));
  let programDetails = [];
  if (programIds.length) {
    const { data } = await window.sb
      .from('programs')
      .select('id, name, program_workouts (order_index, day_label, workout:workouts (id, name, category))')
      .in('id', programIds);
    programDetails = data || [];
  }
  const programWorkoutsMap = new Map(
    programDetails.map(p => [p.id, normalizeProgramWorkoutList(p.program_workouts || [])])
  );
  const dayIndexMap = buildDayIndexByScheduleId(scheduleRows);

  const events = scheduleRows.map(s => {
    const programName = cleanDisplayName(s.programs?.name || 'Program', 'Program');
    const workoutItems = programWorkoutsMap.get(s.program_id) || [];
    const dayIndex = dayIndexMap.get(String(s.id));
    const dayWorkout = getWorkoutItemForDay(workoutItems, dayIndex);
    const colors = buildEventColors(dayWorkout, programName);
    return {
      id: s.id,
      title: buildProgramEventTitle(programName, workoutItems, dayIndex),
      start: s.scheduled_date,
      allDay: true,
      extendedProps: { programId: s.program_id, scheduleId: s.id, dayIndex: dayIndex },
      backgroundColor: colors.backgroundColor,
      borderColor: colors.borderColor,
      textColor: colors.textColor
    };
  });

  const calEl = document.getElementById('calendarContainer');
  const calendar = new window.FullCalendar.Calendar(calEl, {
    initialView: 'dayGridMonth',
    height: 'auto',
    events,
    headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
    eventClick: async function(info) {
      const programId = info.event.extendedProps?.programId;
      if (!programId) return;
      // modal
      const backdrop = document.createElement('div');
      backdrop.className = 'program-modal-backdrop';
      const card = document.createElement('div');
      card.className = 'program-modal-card';
      card.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-2"><h4 class="m-0">Program Details</h4><div><button id="pc-close" class="btn btn-sm btn-outline-secondary">Close</button></div></div><div id="pc-body"><div class="text-muted">Loading...</div></div>';
      backdrop.appendChild(card);
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', function(e){ if (e.target === backdrop) backdrop.remove(); });
      card.querySelector('#pc-close').addEventListener('click', () => backdrop.remove());

      try {
        const { data, error } = await window.sb.from('programs').select(`*, program_workouts (order_index, day_label, workout:workouts (id, name, category, workout_exercises (order_index, sets, reps, rest_seconds, exercise:exercises (id, name))))`).eq('id', programId).single();
        const body = card.querySelector('#pc-body');
        if (error || !data) { body.innerHTML = '<div class="text-danger">Failed to load program.</div>'; return; }
        const pw = (data.program_workouts || []).sort((a,b)=> (a.order_index||0)-(b.order_index||0));
        const html = [];
        if (data.description) html.push(`<div class="mb-2">${data.description}</div>`);
        if (!pw.length) html.push('<div class="text-muted">No workouts in this program.</div>');
        else {
          html.push('<div>');
          pw.forEach(pwi => {
            const w = pwi.workout || {};
            const prefix = pwi.day_label ? `${pwi.day_label} — ` : '';
            html.push(`<div class="mb-2"><strong>${prefix}${w.name || 'Workout'}</strong>`);
            const exercises = (w.workout_exercises||[]).sort((a,b)=> (a.order_index||0)-(b.order_index||0));
            if (exercises.length) {
              html.push('<ul class="mb-0" style="margin-top:6px;">');
              exercises.forEach(ex => {
                const exName = ex.exercise?.name || 'Exercise';
                html.push(`<li>${exName} — ${ex.sets || ''} sets ${ex.reps || ''} <span class="text-muted">(rest ${ex.rest_seconds||0}s)</span></li>`);
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
      } catch (e) { console.error(e); }
    }
  });
  calendar.render();
};
