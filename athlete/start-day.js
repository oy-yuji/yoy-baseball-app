const db = window.sb;
let currentDate = new Date();
let activeAthleteId = null;

const AUTO_WORKOUT_PROGRAM_PREFIX = '__auto_workout__:';
const LEGACY_AUTO_WORKOUT_PREFIX = 'quick:';

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

function formatDateLabel(date) {
	return date.toLocaleDateString(undefined, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

function toDateString(date) {
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

function isSameDay(left, right) {
	return toDateString(left) === toDateString(right);
}

function renderDateLabel() {
	const todayLabel = document.getElementById('todayLabel');
	if (!todayLabel) return;

	const base = formatDateLabel(currentDate);
	todayLabel.textContent = isSameDay(currentDate, new Date()) ? `${base} (Today)` : base;

	const todayBtn = document.getElementById('todayBtn');
	if (todayBtn) todayBtn.disabled = isSameDay(currentDate, new Date());

	const datePicker = document.getElementById('datePicker');
	if (datePicker) datePicker.value = toDateString(currentDate);
}

function normalizeCategory(category) {
	if (!category) return 'other';
	return String(category).toLowerCase();
}

function titleCategory(category) {
	const value = normalizeCategory(category);
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function cleanProgramName(value, fallback = 'Program') {
	const raw = String(value || '').trim();
	if (!raw) return fallback;
	return raw
		.replace(new RegExp(`^${AUTO_WORKOUT_PROGRAM_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*`, 'i'), '')
		.replace(new RegExp(`^${LEGACY_AUTO_WORKOUT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*`, 'i'), '')
		.trim() || fallback;
}

function isAutoWorkoutProgramName(value) {
	return String(value || '').trim().toLowerCase().startsWith(AUTO_WORKOUT_PROGRAM_PREFIX);
}

function normalizeVideoUrl(url) {
	const raw = (url || '').toString().trim();
	if (!raw) return null;
	try {
		const parsed = new URL(raw);
		if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
			return parsed.toString();
		}
		return null;
	} catch (_err) {
		return null;
	}
}

function buildDayIndexByScheduleId(schedules) {
	const programDates = new Map();
	for (const schedule of schedules || []) {
		const programId = schedule?.program_id;
		const dateStr = toDateString(new Date(`${schedule?.scheduled_date}T00:00:00`));
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
		const rawDate = schedule?.scheduled_date;
		const dateStr = rawDate ? toDateString(new Date(`${rawDate}T00:00:00`)) : null;
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

async function resolveAthleteId(userId) {
	const { data: athleteByUser, error: byUserError } = await db
		.from('athletes')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();

	if (!byUserError && athleteByUser?.id) return athleteByUser.id;

	const { data: athleteById, error: byIdError } = await db
		.from('athletes')
		.select('id')
		.eq('id', userId)
		.maybeSingle();

	if (!byIdError && athleteById?.id) return athleteById.id;

	return userId;
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
					workoutNotes: (workout?.notes || '').toString().trim(),
					workoutExerciseNotes: (workoutExercise?.notes || '').toString().trim(),
					exerciseId: exercise.id,
					exerciseName: exercise.name || 'Exercise',
					demoVideoUrl: normalizeVideoUrl(exercise.demo_video_url),
					notes: (exercise.notes || '').toString().trim(),
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

function buildGroupedMap(items) {
	const grouped = new Map();
	for (const item of items) {
		if (!grouped.has(item.category)) grouped.set(item.category, []);
		grouped.get(item.category).push(item);
	}
	return grouped;
}

function renderSchedule(items) {
	const container = document.getElementById('scheduleContent');
	if (!container) return;

	if (!items.length) {
		container.innerHTML = '<div class="card border-0 shadow-sm"><div class="card-body"><div class="alert alert-info mb-0">No exercises are scheduled for this day.</div></div></div>';
		return;
	}

	const headerItem = items[0];
	const headerDay = escapeHtml(headerItem.dayLabel || 'Day');
	const headerWorkout = escapeHtml(headerItem.workoutName || 'Workout');
	const headerProgramName = cleanProgramName(headerItem.programName || 'Program', 'Program');
	const isAutoProgram = isAutoWorkoutProgramName(headerItem.programName || '');
	const headerLine = isAutoProgram
		? `${headerWorkout}`
		: `${headerDay} - ${escapeHtml(headerProgramName)} - ${headerWorkout}`;

	const headerHtml = `
		<div class="text-center fw-semibold fs-4 mb-4">${headerLine}</div>
	`;

	container.innerHTML = headerHtml + items
		.map((item, index) => {
			const safeKey = `${index}`;
			const prescribedSets = item.prescribedSets ?? '-';
			const prescribedReps = item.prescribedReps ?? '-';
			const prescribedRest = item.prescribedRest ?? '-';
			const safeExerciseName = escapeHtml(item.exerciseName);
			const safeNotes = escapeHtml(item.notes || '');
			const safeWorkoutExerciseNotes = escapeHtml(item.workoutExerciseNotes || '');
			const exerciseTitle = item.demoVideoUrl
				? `<a href="${item.demoVideoUrl}" target="_blank" rel="noopener noreferrer" class="link-primary text-decoration-underline">${safeExerciseName}</a>`
				: safeExerciseName;
			const exerciseNameLower = (item.exerciseName || '').toLowerCase();
			const isRunningRelated = /run|sprint|jog|shuttle|tempo|distance|mile|lap/.test(exerciseNameLower);
			const allowWeightInput = !isRunningRelated;
			const setCount = Number.parseInt(item.prescribedSets, 10);
			const renderCount = Number.isFinite(setCount) && setCount > 0 ? setCount : 1;
			const setRows = Array.from({ length: renderCount }, (_, rowIndex) => {
				const setNo = rowIndex + 1;
				return `
					<tr>
						<td class="fw-semibold">Set ${setNo}</td>
						<td>
							<input id="reps-${safeKey}-${setNo}" class="form-control form-control-lg" type="text" />
						</td>
						${allowWeightInput
							? `<td><input id="weight-${safeKey}-${setNo}" class="form-control form-control-lg" type="number" min="0" step="0.5" /></td>`
							: ''}
						<td>
							<input id="rest-${safeKey}-${setNo}" class="form-control form-control-lg" type="number" min="0" step="1" />
						</td>
					</tr>
				`;
			}).join('');

			return `
				<div class="card border-0 shadow-sm mb-3">
					<div class="card-body">
						<div class="d-flex justify-content-between align-items-start gap-2 mb-2">
							<div>
								<h5 class="card-title mb-1 fw-semibold fs-4">${exerciseTitle}</h5>
								${item.demoVideoUrl ? '<div class="small mt-1"><span class="badge rounded-pill text-bg-info">Video available</span></div>' : ''}
							</div>
							<span class="badge text-bg-light">${titleCategory(item.category)}</span>
						</div>

						<div class="fs-5 mb-3 text-secondary">
							<strong>Assigned:</strong> ${prescribedSets} sets • ${prescribedReps} reps • ${prescribedRest}s rest
						</div>

						<div class="small mb-3">
							<strong>Notes:</strong>
							<div class="mt-1 p-2 rounded border ${safeNotes ? '' : 'text-muted'}">${safeNotes || 'No notes provided for this exercise.'}</div>
						</div>

						${safeWorkoutExerciseNotes ? `
							<div class="small mb-3">
								<strong>Workout Notes:</strong>
								<div class="mt-1 p-2 rounded border">${safeWorkoutExerciseNotes}</div>
							</div>
						` : ''}

						<div class="table-responsive">
							<table class="table table-sm align-middle mb-0 table-hover fs-6">
								<thead>
									<tr>
										<th>Set</th>
										<th>Reps done</th>
										${allowWeightInput ? '<th>Weight (lbs)</th>' : ''}
										<th>Rest (sec)</th>
									</tr>
								</thead>
								<tbody>
									${setRows}
								</tbody>
							</table>
						</div>

						<div class="mt-3">
							<button
								class="btn btn-primary save-log-btn px-3"
								type="button"
								data-schedule-id="${item.scheduleId}"
								data-exercise-id="${item.exerciseId}"
								data-input-prefix="${safeKey}"
								data-set-count="${renderCount}"
								disabled
							>
								Save completed sets
							</button>
							<div id="save-status-${safeKey}" class="small mt-2 text-muted"></div>
						</div>
					</div>
				</div>
			`;
		})
		.join('');
}

function updateButtonEnabledState(button) {
	const inputPrefix = button.getAttribute('data-input-prefix');
	const setCount = Number.parseInt(button.getAttribute('data-set-count') || '0', 10);

	let hasAnyInput = false;
	for (let setNo = 1; setNo <= setCount; setNo++) {
		const repsValue = document.getElementById(`reps-${inputPrefix}-${setNo}`)?.value?.trim() || '';
		const restValue = document.getElementById(`rest-${inputPrefix}-${setNo}`)?.value?.trim() || '';
		const weightValue = document.getElementById(`weight-${inputPrefix}-${setNo}`)?.value?.trim() || '';
		if (repsValue || restValue || weightValue) {
			hasAnyInput = true;
			break;
		}
	}

	button.disabled = !hasAnyInput;
}

function setupSaveHandlers(athleteId) {
	const buttons = document.querySelectorAll('.save-log-btn');

	buttons.forEach((button) => {
		const inputPrefix = button.getAttribute('data-input-prefix');
		const setCount = Number.parseInt(button.getAttribute('data-set-count') || '0', 10);
		const statusEl = document.getElementById(`save-status-${inputPrefix}`);

		const syncEnabledState = () => updateButtonEnabledState(button);
		for (let setNo = 1; setNo <= setCount; setNo++) {
			document.getElementById(`reps-${inputPrefix}-${setNo}`)?.addEventListener('input', syncEnabledState);
			document.getElementById(`rest-${inputPrefix}-${setNo}`)?.addEventListener('input', syncEnabledState);
			document.getElementById(`weight-${inputPrefix}-${setNo}`)?.addEventListener('input', syncEnabledState);
		}
		syncEnabledState();

		button.addEventListener('click', async (event) => {
			event.preventDefault();
			event.stopPropagation();
			const scheduleId = button.getAttribute('data-schedule-id');
			const exerciseId = button.getAttribute('data-exercise-id');
			const completedSetPayloads = [];

			for (let setNo = 1; setNo <= setCount; setNo++) {
				const repsValue = document.getElementById(`reps-${inputPrefix}-${setNo}`)?.value?.trim() || '';
				const restValue = document.getElementById(`rest-${inputPrefix}-${setNo}`)?.value?.trim() || '';
				const weightValue = document.getElementById(`weight-${inputPrefix}-${setNo}`)?.value?.trim() || '';
				if (!repsValue && !restValue && !weightValue) continue;

				const parsedWeight = weightValue ? Number.parseFloat(weightValue) : null;

				if (weightValue && Number.isNaN(parsedWeight)) {
					showAlert(`Weight must be a number on Set ${setNo}.`, 'danger');
					return;
				}

				const repsWithRest = restValue
					? `${repsValue || '-'} (rest ${restValue}s)`
					: repsValue || null;

				completedSetPayloads.push({
					athlete_id: athleteId,
					schedule_id: scheduleId,
					exercise_id: exerciseId,
					sets_completed: 1,
					reps_completed: `Set ${setNo}${repsWithRest ? `: ${repsWithRest}` : ''}`,
					weight_lbs: parsedWeight
				});
			}

			if (!completedSetPayloads.length) {
				if (statusEl) statusEl.textContent = 'No changes to save yet.';
				return;
			}

			button.disabled = true;
			button.textContent = 'Saving...';
			if (statusEl) {
				statusEl.className = 'small mt-2 text-muted';
				statusEl.textContent = 'Saving...';
			}

			const { error } = await db.from('workout_logs').insert(completedSetPayloads);

			button.textContent = 'Save completed sets';
			updateButtonEnabledState(button);

			if (error) {
				showAlert(`Failed to save log: ${error.message}`, 'danger');
				if (statusEl) {
					statusEl.className = 'small mt-2 text-danger';
					statusEl.textContent = 'Save failed. Please try again.';
				}
				return;
			}

			if (statusEl) {
				statusEl.className = 'small mt-2 text-success';
				statusEl.textContent = `Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
			}
			showAlert('Completed sets saved.', 'success');
		});
	});
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

async function hydrateSavedInputs(athleteId) {
	const buttons = Array.from(document.querySelectorAll('.save-log-btn'));
	if (!buttons.length) return;

	const bindings = new Map();
	const scheduleIds = [];

	for (const button of buttons) {
		const scheduleId = button.getAttribute('data-schedule-id');
		const exerciseId = button.getAttribute('data-exercise-id');
		const inputPrefix = button.getAttribute('data-input-prefix');
		const setCount = Number.parseInt(button.getAttribute('data-set-count') || '0', 10);
		if (!scheduleId || !exerciseId || !inputPrefix || !setCount) continue;

		bindings.set(`${scheduleId}__${exerciseId}`, { inputPrefix, setCount });
		scheduleIds.push(scheduleId);
	}

	if (!scheduleIds.length) return;

	const uniqueScheduleIds = Array.from(new Set(scheduleIds));
	const { data: logs, error } = await db
		.from('workout_logs')
		.select('id, schedule_id, exercise_id, reps_completed, weight_lbs, logged_at')
		.eq('athlete_id', athleteId)
		.in('schedule_id', uniqueScheduleIds)
		.order('logged_at', { ascending: true })
		.order('id', { ascending: true });

	if (error) {
		console.error('Failed to load existing workout logs for hydration:', error);
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

		if (repsInput) repsInput.value = parsed.reps || '';
		if (restInput) restInput.value = parsed.rest || '';
		if (weightInput && log.weight_lbs !== null && log.weight_lbs !== undefined) weightInput.value = String(log.weight_lbs);
	}
}

async function loadScheduleForCurrentDate() {
	if (!activeAthleteId) return;

	renderDateLabel();
	const selectedDate = toDateString(currentDate);
	const content = document.getElementById('scheduleContent');
	if (content) content.innerHTML = '<div class="card border-0 shadow-sm"><div class="card-body text-muted">Loading schedule...</div></div>';

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
						notes,
						workout_exercises (
							order_index,
							sets,
							reps,
							notes,
							rest_seconds,
							exercise:exercises (
								id,
								name,
												category,
												demo_video_url,
												notes
							)
						)
					)
				)
			)
		`)
		.eq('athlete_id', activeAthleteId)
		.eq('scheduled_date', selectedDate);

	if (scheduleError) {
		showAlert(`Failed to load schedule: ${scheduleError.message}`, 'danger');
		if (content) content.innerHTML = '<div class="text-muted">Could not load schedule.</div>';
		return;
	}

	const scheduleMeta = document.getElementById('scheduleMeta');
	if (scheduleMeta) {
		scheduleMeta.innerHTML = `
			<div class="d-inline-flex align-items-center gap-2 px-3 py-2 bg-light rounded-2 small text-secondary">
				<span class="fw-semibold">${schedules?.length || 0}</span>
				<span>scheduled ${schedules?.length === 1 ? 'program' : 'programs'} for this day</span>
			</div>
		`;
	}

	const dayIndexMap = await buildProgramDayIndexMap(schedules || [], activeAthleteId);
	const exerciseItems = flattenSchedule(schedules || [], dayIndexMap);
	renderSchedule(exerciseItems);
	await hydrateSavedInputs(activeAthleteId);
	setupSaveHandlers(activeAthleteId);
}

async function initStartDay() {
	if (!db) return;

	const { data: sessionData, error: sessionError } = await db.auth.getSession();
	if (sessionError || !sessionData?.session?.user?.id) {
		location.href = '../index.html';
		return;
	}

	const userId = sessionData.session.user.id;
	activeAthleteId = await resolveAthleteId(userId);

	const prevDayBtn = document.getElementById('prevDayBtn');
	const todayBtn = document.getElementById('todayBtn');
	const nextDayBtn = document.getElementById('nextDayBtn');
	const datePicker = document.getElementById('datePicker');

	if (prevDayBtn) {
		prevDayBtn.addEventListener('click', async () => {
			currentDate.setDate(currentDate.getDate() - 1);
			await loadScheduleForCurrentDate();
		});
	}

	if (nextDayBtn) {
		nextDayBtn.addEventListener('click', async () => {
			currentDate.setDate(currentDate.getDate() + 1);
			await loadScheduleForCurrentDate();
		});
	}

	if (todayBtn) {
		todayBtn.addEventListener('click', async () => {
			currentDate = new Date();
			await loadScheduleForCurrentDate();
		});
	}

	if (datePicker) {
		datePicker.addEventListener('change', async () => {
			if (!datePicker.value) return;
			currentDate = new Date(`${datePicker.value}T00:00:00`);
			await loadScheduleForCurrentDate();
		});
	}

	await loadScheduleForCurrentDate();
}

document.addEventListener('DOMContentLoaded', initStartDay);
