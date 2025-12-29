// Timetable Generation Algorithm - Improved Version
// Features:
// - Skips break slots
// - Max 2 of same subject per day, avoids consecutive periods
// - Handles practicals with consecutive periods in labs

// Generate timetable for all or selected class
async function generateTimetable() {
    const selectedClass = document.getElementById('timetableClass').value;
    const container = document.getElementById('timetableContainer');
    const logContainer = document.getElementById('generationLog');
    const logContent = document.getElementById('logContent');

    // Show loading
    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Generating...</span>
            </div>
            <p class="mt-2 text-muted">Generating timetable... Please wait.</p>
        </div>
    `;

    const logs = [];
    const log = (msg) => {
        logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
        console.log(msg);
    };

    try {
        // Fetch all required data
        log('Fetching data from database...');
        const [classesSnap, subjectsSnap, teachersSnap, roomsSnap, slotsSnap] = await Promise.all([
            database.ref('classes').once('value'),
            database.ref('subjects').once('value'),
            database.ref('teachers').once('value'),
            database.ref('rooms').once('value'),
            database.ref('slots').once('value')
        ]);

        const classes = classesSnap.val() || {};
        const subjects = subjectsSnap.val() || {};
        const teachers = teachersSnap.val() || {};
        const rooms = roomsSnap.val() || {};
        const slots = slotsSnap.val() || {};

        // Validate data
        if (Object.keys(classes).length === 0) {
            throw new Error('No classes found. Please add classes first.');
        }
        if (Object.keys(subjects).length === 0) {
            throw new Error('No subjects found. Please add subjects first.');
        }
        if (Object.keys(rooms).length === 0) {
            throw new Error('No rooms found. Please add rooms first.');
        }
        if (Object.keys(slots).length === 0) {
            throw new Error('No time slots found. Please generate time slots first.');
        }

        // Separate classrooms and labs
        const classrooms = Object.entries(rooms).filter(([_, r]) => r.type !== 'lab');
        const labs = Object.entries(rooms).filter(([_, r]) => r.type === 'lab');

        log(`Found: ${Object.keys(classes).length} classes, ${Object.keys(subjects).length} subjects, ${classrooms.length} classrooms, ${labs.length} labs, ${Object.keys(slots).length} slots`);

        // Filter classes if specific one selected
        const targetClasses = selectedClass
            ? { [selectedClass]: classes[selectedClass] }
            : classes;

        // Initialize tracking maps
        const teacherSlotMap = {}; // teacherSlotMap[teacherId][slotId] = true
        const roomSlotMap = {};    // roomSlotMap[roomId][slotId] = true
        const classSlotMap = {};   // classSlotMap[classId][slotId] = true

        // Track subject assignments per day per class: classSubjectDayMap[classId][day][subjectId] = count
        const classSubjectDayMap = {};

        // Initialize maps
        Object.keys(teachers).forEach(tid => teacherSlotMap[tid] = {});
        Object.keys(rooms).forEach(rid => roomSlotMap[rid] = {});
        Object.keys(classes).forEach(cid => {
            classSlotMap[cid] = {};
            classSubjectDayMap[cid] = {
                Monday: {}, Tuesday: {}, Wednesday: {}, Thursday: {}, Friday: {}
            };
        });

        // Timetable entries to save
        const timetableEntries = {};
        const unassigned = [];

        // Filter out break slots and sort for consistent ordering
        const classSlots = Object.entries(slots)
            .filter(([_, slot]) => slot.type !== 'break')
            .sort((a, b) => {
                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
                const dayDiff = days.indexOf(a[1].day) - days.indexOf(b[1].day);
                if (dayDiff !== 0) return dayDiff;
                return a[1].period - b[1].period;
            });

        log(`Using ${classSlots.length} class slots (excluding breaks)`);
        log(`Processing ${Object.keys(targetClasses).length} class(es)...`);

        // Helper: Check if same subject was assigned in previous period
        function wasAssignedPreviousPeriod(classId, day, period, subjectId) {
            const prevPeriod = period - 1;
            if (prevPeriod < 1) return false;
            const prevSlotId = `${day.substring(0, 3)}-P${prevPeriod}`;
            const entry = timetableEntries[classId]?.[prevSlotId];
            return entry?.subjectId === subjectId;
        }

        // Helper: Count same subject on a day
        function getSubjectCountForDay(classId, day, subjectId) {
            return classSubjectDayMap[classId]?.[day]?.[subjectId] || 0;
        }

        // Helper: Find consecutive available slots for practicals
        function findConsecutiveSlots(classId, teacherId, labRoomId, duration, subjectId) {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

            for (const day of days) {
                // Check max per day constraint
                if (getSubjectCountForDay(classId, day, subjectId) >= 2) continue;

                // Get slots for this day, sorted by period
                const daySlots = classSlots
                    .filter(([_, s]) => s.day === day)
                    .sort((a, b) => a[1].period - b[1].period);

                // Try to find consecutive slots
                for (let i = 0; i <= daySlots.length - duration; i++) {
                    const consecutive = [];
                    let valid = true;

                    for (let j = 0; j < duration && valid; j++) {
                        const [slotId, slotData] = daySlots[i + j];

                        // Check consecutive periods (accounting for breaks)
                        if (j > 0) {
                            const prevPeriod = daySlots[i + j - 1][1].period;
                            const currPeriod = slotData.period;
                            // Allow gap of 1 for breaks (e.g., P3 -> P4 after break is OK)
                            if (currPeriod - prevPeriod > 2) {
                                valid = false;
                                continue;
                            }
                        }

                        // Check availability
                        if (classSlotMap[classId][slotId]) valid = false;
                        if (teacherSlotMap[teacherId]?.[slotId]) valid = false;
                        if (labRoomId && roomSlotMap[labRoomId]?.[slotId]) valid = false;

                        if (valid) consecutive.push([slotId, slotData]);
                    }

                    if (valid && consecutive.length === duration) {
                        return consecutive;
                    }
                }
            }
            return null;
        }

        // For each class
        for (const [classId, classData] of Object.entries(targetClasses)) {
            log(`\nProcessing class: ${classData.name} (${classId})`);
            timetableEntries[classId] = {};

            // Get subjects for this class, separate theory and practical
            const classSubjects = Object.entries(subjects)
                .filter(([_, sub]) => sub.classId === classId);

            const theorySubjects = classSubjects.filter(([_, s]) => s.type !== 'practical');
            const practicalSubjects = classSubjects.filter(([_, s]) => s.type === 'practical');

            if (classSubjects.length === 0) {
                log(`  No subjects assigned to this class. Skipping.`);
                continue;
            }

            log(`  Found ${theorySubjects.length} theory and ${practicalSubjects.length} practical subjects`);

            // First, schedule practicals (they need consecutive slots)
            for (const [subjectId, subjectData] of practicalSubjects) {
                const teacherId = subjectData.teacherId;
                const teacherData = teachers[teacherId];
                const sessionsNeeded = subjectData.lecturesPerWeek;
                const duration = subjectData.practicalDuration || 2;
                const labRoomId = subjectData.labRoomId;

                log(`  Practical: ${subjectData.name} (${sessionsNeeded} sessions × ${duration}h, Teacher: ${teacherData?.name || teacherId})`);

                let sessionsAssigned = 0;

                for (let session = 0; session < sessionsNeeded; session++) {
                    const consecutiveSlots = findConsecutiveSlots(classId, teacherId, labRoomId, duration, subjectId);

                    if (!consecutiveSlots) {
                        log(`    Could not find ${duration} consecutive slots for session ${session + 1}`);
                        continue;
                    }

                    // Find available lab room
                    let assignedLab = null;
                    if (labRoomId && labs.find(([id]) => id === labRoomId)) {
                        // Preferred lab
                        let labAvailable = true;
                        for (const [slotId] of consecutiveSlots) {
                            if (roomSlotMap[labRoomId]?.[slotId]) {
                                labAvailable = false;
                                break;
                            }
                        }
                        if (labAvailable) {
                            assignedLab = { id: labRoomId, data: rooms[labRoomId] };
                        }
                    }

                    // If preferred lab not available, find any available lab
                    if (!assignedLab) {
                        for (const [labId, labData] of labs) {
                            let labAvailable = true;
                            for (const [slotId] of consecutiveSlots) {
                                if (roomSlotMap[labId]?.[slotId]) {
                                    labAvailable = false;
                                    break;
                                }
                            }
                            if (labAvailable) {
                                assignedLab = { id: labId, data: labData };
                                break;
                            }
                        }
                    }

                    if (!assignedLab) {
                        log(`    No lab available for consecutive slots`);
                        continue;
                    }

                    // Assign all consecutive slots
                    const day = consecutiveSlots[0][1].day;
                    for (const [slotId, slotData] of consecutiveSlots) {
                        classSlotMap[classId][slotId] = true;
                        if (!teacherSlotMap[teacherId]) teacherSlotMap[teacherId] = {};
                        teacherSlotMap[teacherId][slotId] = true;
                        roomSlotMap[assignedLab.id][slotId] = true;

                        timetableEntries[classId][slotId] = {
                            subjectId,
                            subjectName: subjectData.name,
                            subjectType: 'practical',
                            teacherId,
                            teacherName: teacherData?.name || teacherId,
                            roomId: assignedLab.id,
                            roomName: assignedLab.data.name,
                            practicalSession: session + 1,
                            duration
                        };
                    }

                    // Update subject count for day
                    if (!classSubjectDayMap[classId][day][subjectId]) {
                        classSubjectDayMap[classId][day][subjectId] = 0;
                    }
                    classSubjectDayMap[classId][day][subjectId]++;

                    sessionsAssigned++;
                    log(`    Assigned ${duration}-period practical on ${day} in ${assignedLab.data.name}`);
                }

                if (sessionsAssigned < sessionsNeeded) {
                    const missed = sessionsNeeded - sessionsAssigned;
                    log(`    WARNING: Could only assign ${sessionsAssigned}/${sessionsNeeded} practical sessions`);
                    unassigned.push({
                        classId,
                        subjectId,
                        subjectName: subjectData.name,
                        missed,
                        type: 'practical'
                    });
                }
            }

            // Then, schedule theory subjects
            for (const [subjectId, subjectData] of theorySubjects) {
                const teacherId = subjectData.teacherId;
                const teacherData = teachers[teacherId];
                const lecturesNeeded = subjectData.lecturesPerWeek;

                log(`  Theory: ${subjectData.name} (${lecturesNeeded} lectures/week, Teacher: ${teacherData?.name || teacherId})`);

                let lecturesAssigned = 0;

                // Shuffle slots to distribute better across days
                const shuffledSlots = [...classSlots].sort(() => Math.random() - 0.5);

                // Try to assign required number of lectures
                for (const [slotId, slotData] of shuffledSlots) {
                    if (lecturesAssigned >= lecturesNeeded) break;

                    const day = slotData.day;
                    const period = slotData.period;

                    // Check max 2 per day constraint
                    if (getSubjectCountForDay(classId, day, subjectId) >= 2) continue;

                    // Check not consecutive constraint (avoid same subject in adjacent periods)
                    if (wasAssignedPreviousPeriod(classId, day, period, subjectId)) continue;

                    // Also check if next period already has this subject
                    const nextSlotId = `${day.substring(0, 3)}-P${period + 1}`;
                    if (timetableEntries[classId]?.[nextSlotId]?.subjectId === subjectId) continue;

                    // Check if class slot is free
                    if (classSlotMap[classId][slotId]) continue;

                    // Check if teacher is free
                    if (teacherSlotMap[teacherId]?.[slotId]) continue;

                    // Find available classroom (not lab)
                    let assignedRoom = null;
                    for (const [roomId, roomData] of classrooms) {
                        if (!roomSlotMap[roomId][slotId]) {
                            assignedRoom = { id: roomId, data: roomData };
                            break;
                        }
                    }

                    if (!assignedRoom) {
                        // Try labs if no classrooms available
                        for (const [roomId, roomData] of labs) {
                            if (!roomSlotMap[roomId][slotId]) {
                                assignedRoom = { id: roomId, data: roomData };
                                break;
                            }
                        }
                    }

                    if (!assignedRoom) {
                        continue;
                    }

                    // Assign the lecture
                    classSlotMap[classId][slotId] = true;
                    if (!teacherSlotMap[teacherId]) teacherSlotMap[teacherId] = {};
                    teacherSlotMap[teacherId][slotId] = true;
                    roomSlotMap[assignedRoom.id][slotId] = true;

                    // Update subject count for day
                    if (!classSubjectDayMap[classId][day][subjectId]) {
                        classSubjectDayMap[classId][day][subjectId] = 0;
                    }
                    classSubjectDayMap[classId][day][subjectId]++;

                    timetableEntries[classId][slotId] = {
                        subjectId,
                        subjectName: subjectData.name,
                        subjectType: 'theory',
                        teacherId,
                        teacherName: teacherData?.name || teacherId,
                        roomId: assignedRoom.id,
                        roomName: assignedRoom.data.name
                    };

                    lecturesAssigned++;
                    log(`    Assigned to ${day} P${period} in ${assignedRoom.data.name}`);
                }

                if (lecturesAssigned < lecturesNeeded) {
                    const missed = lecturesNeeded - lecturesAssigned;
                    log(`    WARNING: Could only assign ${lecturesAssigned}/${lecturesNeeded} lectures`);
                    unassigned.push({
                        classId,
                        subjectId,
                        subjectName: subjectData.name,
                        missed,
                        type: 'theory'
                    });
                }
            }
        }

        // Save to database
        log('\nSaving timetable to database...');

        // Clear existing and save new
        if (selectedClass) {
            await database.ref(`timetables/${selectedClass}`).set(timetableEntries[selectedClass] || {});
        } else {
            await database.ref('timetables').set(timetableEntries);
        }

        log('Timetable saved successfully!');

        // Show warnings if any
        if (unassigned.length > 0) {
            log('\n=== WARNINGS ===');
            unassigned.forEach(item => {
                log(`Class ${item.classId}: ${item.subjectName} (${item.type}) - ${item.missed} session(s) could not be scheduled`);
            });
        }

        // Display timetable
        await displayTimetable(selectedClass || Object.keys(targetClasses)[0]);

        // Show log
        logContainer.style.display = 'block';
        logContent.textContent = logs.join('\n');

        showToast(
            unassigned.length > 0
                ? `Timetable generated with ${unassigned.length} warning(s). Check the log.`
                : 'Timetable generated successfully!',
            unassigned.length > 0 ? 'warning' : 'success'
        );

    } catch (error) {
        log(`ERROR: ${error.message}`);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> ${error.message}
            </div>
        `;
        logContainer.style.display = 'block';
        logContent.textContent = logs.join('\n');
        showToast('Error generating timetable: ' + error.message, 'danger');
    }
}

// Display timetable in grid format with breaks
async function displayTimetable(classId) {
    const container = document.getElementById('timetableContainer');
    const title = document.getElementById('timetableTitle');

    // Fetch timetable and slots
    const [timetableSnap, slotsSnap, classesSnap] = await Promise.all([
        database.ref(`timetables/${classId}`).once('value'),
        database.ref('slots').once('value'),
        database.ref(`classes/${classId}`).once('value')
    ]);

    const timetable = timetableSnap.val() || {};
    const slots = slotsSnap.val() || {};
    const classData = classesSnap.val();

    if (Object.keys(timetable).length === 0 && Object.keys(slots).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-calendar-x"></i>
                <h5>No Timetable Found</h5>
                <p>Generate a timetable first</p>
            </div>
        `;
        return;
    }

    title.innerHTML = `
        <span>Timetable: ${classData?.name || classId}</span>
        <button class="btn btn-sm btn-outline-secondary ms-3" onclick="loadExistingTimetables()">
            <i class="bi bi-arrow-left"></i> Back to Overview
        </button>
    `;

    // Build grid - include breaks
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

    // Get all periods including breaks, sorted
    const periodOrder = [1, 2, 3, 'B1', 4, 5, 6, 'B2', 7];
    const allPeriods = [];

    // Build period info from slots
    const periodInfo = {};
    Object.values(slots).forEach(slot => {
        const key = slot.period;
        if (!periodInfo[key]) {
            periodInfo[key] = {
                period: slot.period,
                start: slot.start,
                end: slot.end,
                type: slot.type || 'class',
                label: slot.label
            };
        }
    });

    // Use ordered periods
    periodOrder.forEach(p => {
        if (periodInfo[p]) {
            allPeriods.push(periodInfo[p]);
        }
    });

    if (allPeriods.length === 0) {
        // Fallback if no slots
        container.innerHTML = `
            <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle"></i> No time slots found. Please generate time slots first.
            </div>
        `;
        return;
    }

    let html = `
        <div class="table-responsive">
        <table class="timetable">
            <thead>
                <tr>
                    <th class="period-header">Day / Period</th>
                    ${allPeriods.map(p => {
                        const isBreak = p.type === 'break';
                        const headerClass = isBreak ? 'break-header' : '';
                        const label = isBreak ? (p.label || 'Break') : `Period ${p.period}`;
                        return `
                            <th class="${headerClass}">
                                ${label}<br>
                                <small>${p.start} - ${p.end}</small>
                            </th>
                        `;
                    }).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    days.forEach(day => {
        html += `<tr><td class="day-header">${day}</td>`;

        allPeriods.forEach(periodData => {
            const isBreak = periodData.type === 'break';

            if (isBreak) {
                html += `<td class="slot-cell break-cell">
                    <div class="break-label">${periodData.label || 'Break'}</div>
                </td>`;
            } else {
                const slotId = `${day.substring(0, 3)}-P${periodData.period}`;
                const entry = timetable[slotId];

                if (entry) {
                    const isPractical = entry.subjectType === 'practical';
                    const cellClass = isPractical ? 'practical-cell' : '';
                    html += `
                        <td class="slot-cell ${cellClass}">
                            <div class="subject">${entry.subjectName}</div>
                            ${isPractical ? '<span class="badge bg-success mb-1">Lab</span>' : ''}
                            <div class="teacher"><i class="bi bi-person"></i> ${entry.teacherName}</div>
                            <div class="room"><i class="bi bi-door-open"></i> ${entry.roomName}</div>
                        </td>
                    `;
                } else {
                    html += `<td class="slot-cell empty">-</td>`;
                }
            }
        });
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Listen for class selection changes
document.addEventListener('DOMContentLoaded', () => {
    const classSelect = document.getElementById('timetableClass');
    if (classSelect) {
        classSelect.addEventListener('change', async () => {
            const classId = classSelect.value;
            if (classId) {
                await displayTimetable(classId);
            } else {
                document.getElementById('timetableContainer').innerHTML = `
                    <div class="empty-state">
                        <i class="bi bi-calendar-x"></i>
                        <h5>No Timetable Generated</h5>
                        <p>Click "Generate Timetable" to create a schedule</p>
                    </div>
                `;
            }
        });
    }
});
