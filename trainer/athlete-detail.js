const db = window.sb;
let athleteId = '';
let currentDate = new Date();
let athleteNav = [];
let athleteNavIndex = -1;

function toLocalDateString(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function diffIsoDates(dateStrA, dateStrB) {
	const a = new Date(`${dateStrA}T00:00:00`);
	const b = new Date(`${dateStrB}T00:00:00`);
	return Math.round((a - b) / 86400000);
}

function formatDateLabel(date) {
	return date.toLocaleDateString(undefined, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

function isSameDay(left, right) {
	return toLocalDateString(left) === toLocalDateString(right);
}

function showAlert(message, type = 'danger') {
	const container = document.getElementById('pageAlert');
	if (!container) return;
	container.innerHTML = `<div class="alert alert-${type} mb-0">${message}</div>`;
}

function normalizeSortName(value) {
	return String(value || '').toLowerCase().trim();
}

function updateAthleteNavButtons() {
	const prevBtn = document.getElementById('prevAthleteBtn');
	const nextBtn = document.getElementById('nextAthleteBtn');
	if (!prevBtn || !nextBtn) return;
	const hasPrev = athleteNavIndex > 0;
	const hasNext = athleteNavIndex >= 0 && athleteNavIndex < athleteNav.length - 1;
	prevBtn.disabled = !hasPrev;
	nextBtn.disabled = !hasNext;
	prevBtn.title = hasPrev ? `Previous athlete: ${athleteNav[athleteNavIndex - 1].name}` : 'Previous athlete';
	nextBtn.title = hasNext ? `Next athlete: ${athleteNav[athleteNavIndex + 1].name}` : 'Next athlete';
}

async function loadAthleteNavigation() {
	const prevBtn = document.getElementById('prevAthleteBtn');
	const nextBtn = document.getElementById('nextAthleteBtn');
	if (!prevBtn || !nextBtn) return;

	const { data: sessionData, error: sessionError } = await db.auth.getSession();
	if (sessionError || !sessionData?.session?.user?.id) return;

	const trainerId = sessionData.session.user.id;
	let resp = await db
		.from('athletes')
		.select('id, users(full_name, email)')
		.eq('trainer_id', trainerId);

	if (resp.error) {
		console.error('Failed to load athlete navigation:', resp.error);
		return;
	}

	let athletes = resp.data || [];
	if (!athletes.length) return;

	if (!athletes[0]?.users) {
		const ids = athletes.map((a) => a.id).filter(Boolean);
		if (ids.length) {
			const usersResp = await db.from('users').select('id, full_name, email').in('id', ids);
			if (!usersResp.error && usersResp.data) {
				const usersById = {};
				usersResp.data.forEach((u) => { usersById[u.id] = u; });
				athletes = athletes.map((a) => ({
					id: a.id,
					users: usersById[a.id] || {}
				}));
			}
		}
	}

	athleteNav = athletes
		.map((a) => ({
			id: a.id,
			name: a.users?.full_name || a.users?.email || 'Athlete'
		}))
		.sort((a, b) => normalizeSortName(a.name).localeCompare(normalizeSortName(b.name)));

	athleteNavIndex = athleteNav.findIndex((a) => a.id === athleteId);
	updateAthleteNavButtons();

	prevBtn.addEventListener('click', () => {
		if (athleteNavIndex <= 0) return;
		const target = athleteNav[athleteNavIndex - 1];
		if (!target) return;
		location.href = `athlete-detail.html?id=${encodeURIComponent(target.id)}`;
	});

	nextBtn.addEventListener('click', () => {
		if (athleteNavIndex < 0 || athleteNavIndex >= athleteNav.length - 1) return;
		const target = athleteNav[athleteNavIndex + 1];
		if (!target) return;
		location.href = `athlete-detail.html?id=${encodeURIComponent(target.id)}`;
	});
}

function normalizeCategory(category) {
	if (!category) return 'other';
	return String(category).toLowerCase();
}

function titleCategory(category) {
	const value = normalizeCategory(category);
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseSavedSetValue(repsCompleted) {
	const raw = (repsCompleted || '').toString().trim();
	if (!raw) return { setNo: null, reps: '', rest: '' };

	const setMatch = raw.match(/^Set\s+(\d+)(?::\s*(.*))?$/i);
	if (!setMatch) return { setNo: null, reps: raw, rest: '' };

	const setNo = Number.parseInt(setMatch[1], 10);
	const detail = (setMatch[2] || '').trim();
	if (!detail || detail === '-') return { setNo, reps: '', rest: '' };

	const restMatch = detail.match(/^(.*)\s+\(rest\s+(\d+)s\)$/i);
	if (restMatch) {
		const repsPart = (restMatch[1] || '').trim();
		return {
			setNo,
			reps: repsPart === '-' ? '' : repsPart,
			rest: restMatch[2]
		};
	}

	return {
		setNo,
		reps: detail === '-' ? '' : detail,
		rest: ''
	};
}

function buildDayIndexByScheduleId(schedules) {
	const programDates = new Map();
	for (const schedule of schedules || []) {
		const programId = schedule?.program_id;
		const dateStr = schedule?.scheduled_date ? toLocalDateString(new Date(`${schedule.scheduled_date}T00:00:00`)) : null;
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
		const dateStr = schedule?.scheduled_date ? toLocalDateString(new Date(`${schedule.scheduled_date}T00:00:00`)) : null;
		if (!programId || !dateStr || !schedule?.id) continue;
		const key = `${programId}|${dateStr}`;
		if (programDateIndex.has(key)) {
			scheduleIndex.set(String(schedule.id), programDateIndex.get(key));
		}
	}

	return scheduleIndex;
}

async function buildProgramDayIndexMap(scheduleRows, athleteId) {
	const programIds = Array.from(new Set(
		(scheduleRows || [])
			.map(row => row?.program?.id)
			.filter(Boolean)
	));
	if (!programIds.length) return new Map();

	const { data, error } = await db
		.from('athlete_schedule')
		.select('id, scheduled_date, program_id')
		.eq('athlete_id', athleteId)
		.in('program_id', programIds);

	if (error) {
		console.error('Failed to load program schedule map:', error);
		return new Map();
	}

	return buildDayIndexByScheduleId(data || []);
}

function flattenSchedule(scheduleRows, dayIndexMap) {
	const exerciseItems = [];

	for (const schedule of scheduleRows || []) {
		const program = schedule.program;
		let programWorkouts = (program?.program_workouts || []).slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
		const dayIndex = dayIndexMap?.get(String(schedule.id));
		if (Number.isInteger(dayIndex)) {
			const selected = programWorkouts[dayIndex];
			programWorkouts = selected ? [selected] : [];
		}

		for (const programWorkout of programWorkouts) {
			const workout = programWorkout.workout;
			const workoutExercises = (workout?.workout_exercises || []).slice().sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

			for (const workoutExercise of workoutExercises) {
				const exercise = workoutExercise.exercise;
				if (!exercise?.id) continue;

				exerciseItems.push({
					scheduleId: schedule.id,
					programName: program?.name || 'Program',
					dayLabel: programWorkout.day_label || '',
					workoutName: workout?.name || 'Workout',
					exerciseId: exercise.id,
					exerciseName: exercise.name || 'Exercise',
					category: normalizeCategory(exercise.category),
					prescribedSets: workoutExercise.sets,
					prescribedReps: workoutExercise.reps,
					prescribedRest: workoutExercise.rest_seconds
				});
			}
		}
	}

	return exerciseItems;
}

function renderDayLabel() {
	const dayLabel = document.getElementById('dayLabel');
	if (!dayLabel) return;
	const text = formatDateLabel(currentDate);
	dayLabel.textContent = isSameDay(currentDate, new Date()) ? `${text} (Today)` : text;

	const todayBtn = document.getElementById('todayBtn');
	if (todayBtn) todayBtn.disabled = isSameDay(currentDate, new Date());
}

async function loadAthleteHeader() {
	const { data, error } = await db
		.from('users')
		.select('full_name, email')
		.eq('id', athleteId)
		.maybeSingle();

	if (error) {
		showAlert(`Could not load athlete profile: ${error.message}`);
		return;
	}

	const athleteName = document.getElementById('athleteName');
	if (athleteName) athleteName.textContent = data?.full_name || data?.email || 'Athlete Day View';
}

function renderAssignedSchedule(items) {
	const container = document.getElementById('logsContainer');
	if (!container) return;

	if (!items.length) {
		container.innerHTML = '<div class="alert alert-info mb-0">No exercises are scheduled for this day.</div>';
		return;
	}

	container.innerHTML = items
		.map((item, index) => {
			const safeKey = `${index}`;
			const prescribedSets = item.prescribedSets ?? '-';
			const prescribedReps = item.prescribedReps ?? '-';
			const prescribedRest = item.prescribedRest ?? '-';
			const exerciseNameLower = (item.exerciseName || '').toLowerCase();
			const isRunningRelated = /run|sprint|jog|shuttle|tempo|distance|mile|lap/.test(exerciseNameLower);
			const allowWeightInput = !isRunningRelated;
			const setCount = Number.parseInt(item.prescribedSets, 10);
			const renderCount = Number.isFinite(setCount) && setCount > 0 ? setCount : 1;

			const setRows = Array.from({ length: renderCount }, (_, rowIndex) => {
				const setNo = rowIndex + 1;
				return `
					<tr>
						<td class="small">Set ${setNo}</td>
						<td><input id="reps-${safeKey}-${setNo}" class="form-control form-control-sm" type="text" readonly /></td>
						${allowWeightInput ? `<td><input id="weight-${safeKey}-${setNo}" class="form-control form-control-sm" type="number" readonly /></td>` : ''}
						<td><input id="rest-${safeKey}-${setNo}" class="form-control form-control-sm" type="number" readonly /></td>
						<td><span id="status-${safeKey}-${setNo}" class="badge text-bg-danger">Skipped</span></td>
					</tr>
				`;
			}).join('');

			return `
				<div class="card border-0 shadow-sm mb-3">
					<div class="card-body">
						<div class="d-flex justify-content-between align-items-start gap-2 mb-2">
							<div>
								<h5 class="card-title mb-1 fw-semibold">${item.exerciseName}</h5>
								<div class="small text-muted">${item.programName} • ${item.dayLabel || item.workoutName}</div>
							</div>
							<span class="badge text-bg-light">${titleCategory(item.category)}</span>
						</div>

						<div class="small mb-3 text-secondary">
							<strong>Assigned:</strong> ${prescribedSets} sets • ${prescribedReps} reps • ${prescribedRest}s rest
						</div>

						<div class="table-responsive">
							<table class="table table-sm align-middle mb-0 table-hover">
								<thead>
									<tr>
										<th>Set</th>
										<th>Reps done</th>
										${allowWeightInput ? '<th>Weight (lbs)</th>' : ''}
										<th>Rest (sec)</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>${setRows}</tbody>
							</table>
						</div>
					</div>
				</div>
			`;
		})
		.join('');
}

async function hydrateSubmittedLogs(items) {
	if (!items.length) return;

	const bindings = new Map();
	const scheduleIds = [];

	items.forEach((item, index) => {
		const setCount = Number.parseInt(item.prescribedSets, 10);
		const renderCount = Number.isFinite(setCount) && setCount > 0 ? setCount : 1;
		bindings.set(`${item.scheduleId}__${item.exerciseId}`, {
			inputPrefix: `${index}`,
			setCount: renderCount
		});
		scheduleIds.push(item.scheduleId);
	});

	const uniqueScheduleIds = Array.from(new Set(scheduleIds));
	const { data: logs, error } = await db
		.from('workout_logs')
		.select('id, schedule_id, exercise_id, reps_completed, weight_lbs, logged_at')
		.eq('athlete_id', athleteId)
		.in('schedule_id', uniqueScheduleIds)
		.order('logged_at', { ascending: true })
		.order('id', { ascending: true });

	if (error) {
		showAlert(`Failed to load submitted inputs: ${error.message}`);
		return;
	}

	for (const log of logs || []) {
		const binding = bindings.get(`${log.schedule_id}__${log.exercise_id}`);
		if (!binding) continue;

		const parsed = parseSavedSetValue(log.reps_completed);
		if (!parsed.setNo || parsed.setNo < 1 || parsed.setNo > binding.setCount) continue;

		const repsInput = document.getElementById(`reps-${binding.inputPrefix}-${parsed.setNo}`);
		const restInput = document.getElementById(`rest-${binding.inputPrefix}-${parsed.setNo}`);
		const weightInput = document.getElementById(`weight-${binding.inputPrefix}-${parsed.setNo}`);
		const statusEl = document.getElementById(`status-${binding.inputPrefix}-${parsed.setNo}`);

		if (repsInput) repsInput.value = parsed.reps || '';
		if (restInput) restInput.value = parsed.rest || '';
		if (weightInput && log.weight_lbs !== null && log.weight_lbs !== undefined) weightInput.value = String(log.weight_lbs);
		if (statusEl) {
			statusEl.className = 'badge text-bg-success';
			statusEl.textContent = 'Completed';
		}
	}
}

async function loadAthleteDayView() {
	renderDayLabel();
	const selectedDate = toLocalDateString(currentDate);

	const logsContainer = document.getElementById('logsContainer');
	if (logsContainer) logsContainer.innerHTML = '<div class="text-muted">Loading...</div>';

	const { data: schedules, error: scheduleError } = await db
		.from('athlete_schedule')
		.select(`
			id,
			scheduled_date,
			program:programs (
				id,
				name,
				program_workouts (
					order_index,
					day_label,
					workout:workouts (
						id,
						name,
						workout_exercises (
							order_index,
							sets,
							reps,
							rest_seconds,
							exercise:exercises (
								id,
								name,
								category
							)
						)
					)
				)
			)
		`)
		.eq('athlete_id', athleteId)
		.eq('scheduled_date', selectedDate);

	if (scheduleError) {
		showAlert(`Failed to load schedule: ${scheduleError.message}`);
		return;
	}

	const dayIndexMap = await buildProgramDayIndexMap(schedules || [], athleteId);
	const exerciseItems = flattenSchedule(schedules || [], dayIndexMap);
	const summary = document.getElementById('summary');
	if (summary) {
		summary.innerHTML = `
			<div class="d-inline-flex align-items-center gap-2 px-3 py-2 bg-light rounded-2 small text-secondary">
				<span class="fw-semibold">${schedules?.length || 0}</span>
				<span>scheduled ${schedules?.length === 1 ? 'program' : 'programs'}</span>
				<span>•</span>
				<span class="fw-semibold">${exerciseItems.length}</span>
				<span>${exerciseItems.length === 1 ? 'assigned exercise' : 'assigned exercises'}</span>
			</div>
		`;
	}

	renderAssignedSchedule(exerciseItems);
	await hydrateSubmittedLogs(exerciseItems);
}

async function initAthleteDetailPage() {
	if (!db) return;

	const { data: sessionData, error: sessionError } = await db.auth.getSession();
	if (sessionError || !sessionData?.session?.user?.id) {
		location.href = '../index.html';
		return;
	}

	const params = new URLSearchParams(location.search);
	athleteId = params.get('id') || '';
	if (!athleteId) {
		showAlert('Missing athlete id in URL.');
		return;
	}

	await loadAthleteHeader();
	await loadAthleteNavigation();

	const prevDayBtn = document.getElementById('prevDayBtn');
	const todayBtn = document.getElementById('todayBtn');
	const nextDayBtn = document.getElementById('nextDayBtn');

	if (prevDayBtn) {
		prevDayBtn.addEventListener('click', async () => {
			currentDate.setDate(currentDate.getDate() - 1);
			await loadAthleteDayView();
		});
	}

	if (todayBtn) {
		todayBtn.addEventListener('click', async () => {
			currentDate = new Date();
			await loadAthleteDayView();
		});
	}

	if (nextDayBtn) {
		nextDayBtn.addEventListener('click', async () => {
			currentDate.setDate(currentDate.getDate() + 1);
			await loadAthleteDayView();
		});
	}

	await loadAthleteDayView();
}

document.addEventListener('DOMContentLoaded', initAthleteDetailPage);
