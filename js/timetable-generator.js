// Timetable Generation Algorithm - Improved Version
// Features:
// - Skips break slots
// - Max 2 of same subject per day, avoids consecutive periods
// - Handles practicals with consecutive periods in labs
// - Supports batch-based practicals with parallel scheduling

// Helper function to escape HTML for display
function escapeHtmlDisplay(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

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

        // Helper: Find consecutive slots for batch-based practicals (all batch teachers must be free)
        function findConsecutiveSlotsForBatchPractical(classId, batchTeachers, batchLabs, duration, subjectId) {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
            const teacherIds = Object.values(batchTeachers);
            const labIds = Object.values(batchLabs);

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
                            if (currPeriod - prevPeriod > 2) {
                                valid = false;
                                continue;
                            }
                        }

                        // Check if class slot is free
                        if (classSlotMap[classId][slotId]) valid = false;

                        // Check if ALL batch teachers are free
                        for (const teacherId of teacherIds) {
                            if (teacherSlotMap[teacherId]?.[slotId]) {
                                valid = false;
                                break;
                            }
                            // Check teacher's unavailable slots
                            const teacherInfo = teachers[teacherId];
                            if (teacherInfo?.unavailableSlots?.includes(slotId)) {
                                valid = false;
                                break;
                            }
                        }

                        // Check if ALL batch labs are free
                        for (const labId of labIds) {
                            if (roomSlotMap[labId]?.[slotId]) {
                                valid = false;
                                break;
                            }
                        }

                        if (valid) consecutive.push([slotId, slotData]);
                    }

                    if (valid && consecutive.length === duration) {
                        return consecutive;
                    }
                }
            }
            return null;
        }

        // Schedule batch-based practicals with ROUND-ROBIN rotation
        // Different batches get different practical subjects in the same timeslot
        async function scheduleBatchPracticals(classId, classData) {
            const batchPracticalSubjects = Object.entries(subjects)
                .filter(([_, sub]) => sub.classId === classId && sub.type === 'practical' && sub.isBatchBased);

            if (batchPracticalSubjects.length === 0) return;

            const batches = classData.labBatches || [];
            if (batches.length === 0) {
                log(`  WARNING: Class has no lab batches configured`);
                return;
            }

            log(`  Found ${batchPracticalSubjects.length} batch-based practical subject(s) for ${batches.length} batches`);
            log(`  Using ROUND-ROBIN scheduling: different subjects per batch in same timeslot`);

            // Calculate total sessions needed across all batch practicals
            const subjectSessions = batchPracticalSubjects.map(([subjectId, subjectData]) => ({
                subjectId,
                subjectData,
                sessionsNeeded: subjectData.lecturesPerWeek,
                sessionsAssigned: 0,
                duration: subjectData.practicalDuration || 2
            }));

            // Track which subjects each batch has completed (for fair rotation)
            const batchSubjectCount = {};
            batches.forEach(batch => {
                batchSubjectCount[batch] = {};
                subjectSessions.forEach(s => {
                    batchSubjectCount[batch][s.subjectId] = 0;
                });
            });

            // Keep scheduling until all subjects have their required sessions
            let totalSessionsScheduled = 0;
            const maxIterations = 50; // Safety limit
            let iteration = 0;

            while (iteration < maxIterations) {
                iteration++;

                // Check if any subject still needs sessions
                const subjectsNeedingSessions = subjectSessions.filter(
                    s => s.sessionsAssigned < s.sessionsNeeded
                );

                if (subjectsNeedingSessions.length === 0) break;

                // Get max duration needed for this scheduling round
                const maxDuration = Math.max(...subjectsNeedingSessions.map(s => s.duration));

                // Collect all teachers and labs needed for available subjects
                const allTeacherIds = new Set();
                const allLabIds = new Set();

                subjectsNeedingSessions.forEach(({ subjectData }) => {
                    const batchTeachers = subjectData.batchTeachers || {};
                    const batchLabs = subjectData.batchLabs || {};
                    Object.values(batchTeachers).forEach(t => allTeacherIds.add(t));
                    Object.values(batchLabs).forEach(l => allLabIds.add(l));
                });

                // Find consecutive slots where we can schedule parallel practicals
                const consecutiveSlots = findConsecutiveSlotsForRoundRobin(
                    classId,
                    Array.from(allTeacherIds),
                    Array.from(allLabIds),
                    maxDuration,
                    subjectsNeedingSessions.map(s => s.subjectId)
                );

                if (!consecutiveSlots) {
                    log(`    No more available slots for batch practicals`);
                    break;
                }

                const day = consecutiveSlots[0][1].day;

                // Round-robin assignment: assign different subjects to different batches
                // Sort batches by total sessions to balance load
                const sortedBatches = [...batches].sort((a, b) => {
                    const aTotal = Object.values(batchSubjectCount[a]).reduce((sum, c) => sum + c, 0);
                    const bTotal = Object.values(batchSubjectCount[b]).reduce((sum, c) => sum + c, 0);
                    return aTotal - bTotal;
                });

                // Build batch schedule with DIFFERENT subjects per batch
                const batchSchedule = {};
                const usedSubjectsThisSlot = new Set();
                const assignedSubjectIds = [];

                for (const batch of sortedBatches) {
                    // Find the subject this batch needs most (least completed, still needs sessions)
                    let bestSubject = null;
                    let lowestCount = Infinity;

                    for (const subjectInfo of subjectsNeedingSessions) {
                        // Skip if this subject is already assigned to another batch this slot
                        if (usedSubjectsThisSlot.has(subjectInfo.subjectId)) continue;

                        // Skip if subject already at max sessions
                        if (subjectInfo.sessionsAssigned >= subjectInfo.sessionsNeeded) continue;

                        // Check if this batch has valid teacher/lab for this subject
                        const batchTeachers = subjectInfo.subjectData.batchTeachers || {};
                        const batchLabs = subjectInfo.subjectData.batchLabs || {};
                        if (!batchTeachers[batch] || !batchLabs[batch]) continue;

                        // Check if this batch's teacher and lab are actually free for these slots
                        const teacherId = batchTeachers[batch];
                        const labId = batchLabs[batch];
                        let resourcesFree = true;

                        for (const [slotId] of consecutiveSlots) {
                            if (teacherSlotMap[teacherId]?.[slotId] || roomSlotMap[labId]?.[slotId]) {
                                resourcesFree = false;
                                break;
                            }
                        }

                        if (!resourcesFree) continue;

                        const count = batchSubjectCount[batch][subjectInfo.subjectId];
                        if (count < lowestCount) {
                            lowestCount = count;
                            bestSubject = subjectInfo;
                        }
                    }

                    if (bestSubject) {
                        const teacherId = bestSubject.subjectData.batchTeachers[batch];
                        const labId = bestSubject.subjectData.batchLabs[batch];

                        batchSchedule[batch] = {
                            subjectId: bestSubject.subjectId,
                            subjectName: bestSubject.subjectData.name,
                            teacherId,
                            teacherName: teachers[teacherId]?.name || teacherId,
                            roomId: labId,
                            roomName: rooms[labId]?.name || labId
                        };

                        usedSubjectsThisSlot.add(bestSubject.subjectId);
                        if (!assignedSubjectIds.includes(bestSubject.subjectId)) {
                            assignedSubjectIds.push(bestSubject.subjectId);
                        }
                    }
                }

                // Only proceed if we assigned at least one batch
                if (Object.keys(batchSchedule).length === 0) {
                    log(`    Could not assign any batches in this iteration`);
                    break;
                }

                // Mark all resources as occupied and update counters
                for (const [slotId] of consecutiveSlots) {
                    classSlotMap[classId][slotId] = true;

                    // Mark each batch's specific teacher and lab as occupied
                    for (const [batch, info] of Object.entries(batchSchedule)) {
                        if (!teacherSlotMap[info.teacherId]) teacherSlotMap[info.teacherId] = {};
                        teacherSlotMap[info.teacherId][slotId] = true;
                        roomSlotMap[info.roomId][slotId] = true;
                    }

                    // Store batch-practical entry with round-robin schedule
                    timetableEntries[classId][slotId] = {
                        subjectId: 'batch-practical-multi', // Multiple subjects
                        subjectName: 'Batch Practicals',
                        subjectType: 'batch-practical',
                        batchSchedule,
                        practicalDuration: maxDuration
                    };
                }

                // Update counters for assigned subjects
                for (const [batch, info] of Object.entries(batchSchedule)) {
                    batchSubjectCount[batch][info.subjectId]++;

                    // Find and update the subject's sessionsAssigned
                    const subjectInfo = subjectSessions.find(s => s.subjectId === info.subjectId);
                    if (subjectInfo) {
                        // Only increment once per unique subject this slot (not per batch)
                    }
                }

                // Increment sessionsAssigned for each unique subject scheduled
                for (const subjectId of assignedSubjectIds) {
                    const subjectInfo = subjectSessions.find(s => s.subjectId === subjectId);
                    if (subjectInfo) {
                        subjectInfo.sessionsAssigned++;
                    }
                }

                // Update subject count for day
                for (const subjectId of assignedSubjectIds) {
                    if (!classSubjectDayMap[classId][day][subjectId]) {
                        classSubjectDayMap[classId][day][subjectId] = 0;
                    }
                    classSubjectDayMap[classId][day][subjectId]++;
                }

                totalSessionsScheduled++;
                const batchAssignments = Object.entries(batchSchedule)
                    .map(([batch, info]) => `${batch}→${info.subjectName}`)
                    .join(', ');
                log(`    Round-robin slot on ${day}: ${batchAssignments}`);
            }

            // Report any unassigned sessions
            for (const subjectInfo of subjectSessions) {
                if (subjectInfo.sessionsAssigned < subjectInfo.sessionsNeeded) {
                    const missed = subjectInfo.sessionsNeeded - subjectInfo.sessionsAssigned;
                    log(`    WARNING: ${subjectInfo.subjectData.name} - only ${subjectInfo.sessionsAssigned}/${subjectInfo.sessionsNeeded} sessions`);
                    unassigned.push({
                        classId,
                        subjectId: subjectInfo.subjectId,
                        subjectName: subjectInfo.subjectData.name,
                        missed,
                        type: 'batch-practical'
                    });
                }
            }

            log(`  Total batch practical slots scheduled: ${totalSessionsScheduled}`);
        }

        // Find consecutive slots for round-robin batch practicals
        function findConsecutiveSlotsForRoundRobin(classId, allTeacherIds, allLabIds, duration, subjectIds) {
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

            for (const day of days) {
                // Check max per day constraint for any of the subjects
                let dayOverloaded = false;
                for (const subjectId of subjectIds) {
                    if (getSubjectCountForDay(classId, day, subjectId) >= 2) {
                        dayOverloaded = true;
                        break;
                    }
                }
                if (dayOverloaded) continue;

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
                            if (currPeriod - prevPeriod > 2) {
                                valid = false;
                                continue;
                            }
                        }

                        // Check if class slot is free
                        if (classSlotMap[classId][slotId]) valid = false;

                        if (valid) consecutive.push([slotId, slotData]);
                    }

                    if (valid && consecutive.length === duration) {
                        return consecutive;
                    }
                }
            }
            return null;
        }

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

                        // Check teacher's unavailable slots
                        const teacherInfo = teachers[teacherId];
                        if (teacherInfo?.unavailableSlots?.includes(slotId)) valid = false;

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

            // Get subjects for this class, separate theory, regular practical, and batch practical
            const classSubjects = Object.entries(subjects)
                .filter(([_, sub]) => sub.classId === classId);

            const theorySubjects = classSubjects.filter(([_, s]) => s.type !== 'practical');
            const batchPracticalSubjects = classSubjects.filter(([_, s]) => s.type === 'practical' && s.isBatchBased);
            const regularPracticalSubjects = classSubjects.filter(([_, s]) => s.type === 'practical' && !s.isBatchBased);

            if (classSubjects.length === 0) {
                log(`  No subjects assigned to this class. Skipping.`);
                continue;
            }

            log(`  Found ${theorySubjects.length} theory, ${batchPracticalSubjects.length} batch-practical, and ${regularPracticalSubjects.length} regular practical subjects`);

            // FIRST: Schedule batch-based practicals (most constrained)
            if (batchPracticalSubjects.length > 0) {
                await scheduleBatchPracticals(classId, classData);
            }

            // SECOND: Schedule regular practicals (non-batch-based)
            for (const [subjectId, subjectData] of regularPracticalSubjects) {
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

            // THIRD: Schedule theory subjects
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

                    // Check teacher's unavailable slots
                    if (teacherData?.unavailableSlots?.includes(slotId)) continue;

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

        // Clear existing and save new with draft status
        if (selectedClass) {
            const timetableData = timetableEntries[selectedClass] || {};
            timetableData.status = 'draft';
            timetableData.updatedAt = Date.now();
            timetableData.createdBy = auth.currentUser?.uid;
            await database.ref(`timetables/${selectedClass}`).set(timetableData);

            // Show draft/publish buttons
            if (typeof showTimetableActions === 'function') {
                showTimetableActions(selectedClass, timetableData);
            }
        } else {
            // Add status to all timetables
            Object.keys(timetableEntries).forEach(classId => {
                timetableEntries[classId].status = 'draft';
                timetableEntries[classId].updatedAt = Date.now();
                timetableEntries[classId].createdBy = auth.currentUser?.uid;
            });
            await database.ref('timetables').set(timetableEntries);

            // Show buttons for first class
            const firstClass = Object.keys(targetClasses)[0];
            if (typeof showTimetableActions === 'function' && firstClass) {
                showTimetableActions(firstClass, timetableEntries[firstClass]);
            }
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

        // Show AI analyze button
        if (typeof showAIAnalyzeButton === 'function') {
            showAIAnalyzeButton();
        }

        // Reload saved timetables list
        if (typeof loadSavedTimetables === 'function') {
            loadSavedTimetables();
        }

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
    const periodOrder = [1, 2, 3, 4, 'B1', 5, 6, 7, 'B2', 8, 9];
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
                    const isBatchPractical = entry.subjectType === 'batch-practical';

                    if (isBatchPractical && entry.batchSchedule) {
                        // Batch-practical cell with grid showing all batches (round-robin: different subjects per batch)
                        const batchEntries = Object.entries(entry.batchSchedule);

                        // Check if all batches have the same subject (old style) or different subjects (round-robin)
                        const uniqueSubjects = new Set(batchEntries.map(([_, info]) => info.subjectId));
                        const isRoundRobin = uniqueSubjects.size > 1;

                        let batchHtml = batchEntries.map(([batch, info]) => `
                            <div class="batch-item">
                                <span class="badge bg-info">${escapeHtmlDisplay(batch)}</span>
                                ${isRoundRobin ? `<strong class="batch-subject">${escapeHtmlDisplay(info.subjectName)}</strong>` : ''}
                                <small>${escapeHtmlDisplay(info.teacherName)}</small>
                                <small class="text-muted">${escapeHtmlDisplay(info.roomName)}</small>
                            </div>
                        `).join('');

                        const headerSubject = isRoundRobin ? 'Batch Practicals' : escapeHtmlDisplay(entry.subjectName);

                        html += `
                            <td class="slot-cell batch-practical-cell">
                                <div class="subject">${headerSubject}</div>
                                <span class="badge bg-success mb-1">${isRoundRobin ? 'Round-Robin' : 'Batch Lab'}</span>
                                <div class="batch-grid">${batchHtml}</div>
                            </td>
                        `;
                    } else if (isPractical) {
                        // Regular practical cell
                        html += `
                            <td class="slot-cell practical-cell">
                                <div class="subject">${escapeHtmlDisplay(entry.subjectName)}</div>
                                <span class="badge bg-success mb-1">Lab</span>
                                <div class="teacher"><i class="bi bi-person"></i> ${escapeHtmlDisplay(entry.teacherName)}</div>
                                <div class="room"><i class="bi bi-door-open"></i> ${escapeHtmlDisplay(entry.roomName)}</div>
                            </td>
                        `;
                    } else {
                        // Theory cell
                        html += `
                            <td class="slot-cell">
                                <div class="subject">${escapeHtmlDisplay(entry.subjectName)}</div>
                                <div class="teacher"><i class="bi bi-person"></i> ${escapeHtmlDisplay(entry.teacherName)}</div>
                                <div class="room"><i class="bi bi-door-open"></i> ${escapeHtmlDisplay(entry.roomName)}</div>
                            </td>
                        `;
                    }
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

// Display timetable with batch filter (shows batch-specific view)
// Uses escapeHtmlDisplay for XSS prevention on all user data
async function displayTimetableWithBatchFilter(classId, batchFilter) {
    const container = document.getElementById('timetableContainer');
    const title = document.getElementById('timetableTitle');

    const [timetableSnap, slotsSnap, classesSnap] = await Promise.all([
        database.ref(`timetables/${classId}`).once('value'),
        database.ref('slots').once('value'),
        database.ref(`classes/${classId}`).once('value')
    ]);

    const timetable = timetableSnap.val() || {};
    const slots = slotsSnap.val() || {};
    const classData = classesSnap.val();

    if (Object.keys(timetable).length === 0) {
        container.textContent = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.innerHTML = '<i class="bi bi-calendar-x"></i><h5>No Timetable Found</h5><p>Generate a timetable first</p>';
        container.appendChild(emptyDiv);
        return;
    }

    const batchLabel = batchFilter ? ` - Batch ${escapeHtmlDisplay(batchFilter)}` : '';
    title.textContent = '';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = `Timetable: ${classData?.name || classId}${batchFilter ? ' - Batch ' + batchFilter : ''}`;
    title.appendChild(titleSpan);

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-sm btn-outline-secondary ms-3';
    backBtn.innerHTML = '<i class="bi bi-arrow-left"></i> Back to Overview';
    backBtn.onclick = loadExistingTimetables;
    title.appendChild(backBtn);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periodOrder = [1, 2, 3, 4, 'B1', 5, 6, 7, 'B2', 8, 9];
    const allPeriods = [];
    const periodInfo = {};

    Object.values(slots).forEach(slot => {
        const key = slot.period;
        if (!periodInfo[key]) {
            periodInfo[key] = { period: slot.period, start: slot.start, end: slot.end, type: slot.type || 'class', label: slot.label };
        }
    });

    periodOrder.forEach(p => { if (periodInfo[p]) allPeriods.push(periodInfo[p]); });

    if (allPeriods.length === 0) {
        container.textContent = '';
        const alert = document.createElement('div');
        alert.className = 'alert alert-warning';
        alert.textContent = 'No time slots found.';
        container.appendChild(alert);
        return;
    }

    // Build table using DOM methods for safety
    const wrapper = document.createElement('div');
    wrapper.className = 'table-responsive';
    const table = document.createElement('table');
    table.className = 'timetable';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const dayTh = document.createElement('th');
    dayTh.className = 'period-header';
    dayTh.textContent = 'Day / Period';
    headerRow.appendChild(dayTh);

    allPeriods.forEach(p => {
        const th = document.createElement('th');
        th.className = p.type === 'break' ? 'break-header' : '';
        const label = p.type === 'break' ? (p.label || 'Break') : `Period ${p.period}`;
        th.innerHTML = `${escapeHtmlDisplay(label)}<br><small>${p.start} - ${p.end}</small>`;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    days.forEach(day => {
        const row = document.createElement('tr');
        const dayTd = document.createElement('td');
        dayTd.className = 'day-header';
        dayTd.textContent = day;
        row.appendChild(dayTd);

        allPeriods.forEach(periodData => {
            const td = document.createElement('td');

            if (periodData.type === 'break') {
                td.className = 'slot-cell break-cell';
                td.innerHTML = `<div class="break-label">${escapeHtmlDisplay(periodData.label || 'Break')}</div>`;
            } else {
                const slotId = `${day.substring(0, 3)}-P${periodData.period}`;
                const entry = timetable[slotId];

                if (entry) {
                    const isBatchPractical = entry.subjectType === 'batch-practical';
                    const isPractical = entry.subjectType === 'practical';

                    if (isBatchPractical && entry.batchSchedule) {
                        if (batchFilter) {
                            const batchInfo = entry.batchSchedule[batchFilter];
                            if (batchInfo) {
                                td.className = 'slot-cell practical-cell';
                                const subjectName = batchInfo.subjectName || entry.subjectName;
                                td.innerHTML = `
                                    <div class="subject">${escapeHtmlDisplay(subjectName)}</div>
                                    <span class="badge bg-success mb-1">Lab (${escapeHtmlDisplay(batchFilter)})</span>
                                    <div class="teacher"><i class="bi bi-person"></i> ${escapeHtmlDisplay(batchInfo.teacherName)}</div>
                                    <div class="room"><i class="bi bi-door-open"></i> ${escapeHtmlDisplay(batchInfo.roomName)}</div>
                                `;
                            } else {
                                td.className = 'slot-cell empty text-muted';
                                td.textContent = '-';
                            }
                        } else {
                            td.className = 'slot-cell batch-practical-cell';
                            const batchEntries = Object.entries(entry.batchSchedule);
                            const uniqueSubjects = new Set(batchEntries.map(([_, info]) => info.subjectId));
                            const isRoundRobin = uniqueSubjects.size > 1;
                            let batchHtml = batchEntries.map(([batch, info]) => `
                                <div class="batch-item">
                                    <span class="badge bg-info">${escapeHtmlDisplay(batch)}</span>
                                    ${isRoundRobin ? `<strong class="batch-subject">${escapeHtmlDisplay(info.subjectName)}</strong>` : ''}
                                    <small>${escapeHtmlDisplay(info.teacherName)}</small>
                                    <small class="text-muted">${escapeHtmlDisplay(info.roomName)}</small>
                                </div>
                            `).join('');
                            const headerSubject = isRoundRobin ? 'Batch Practicals' : escapeHtmlDisplay(entry.subjectName);
                            td.innerHTML = `
                                <div class="subject">${headerSubject}</div>
                                <span class="badge bg-success mb-1">${isRoundRobin ? 'Round-Robin' : 'Batch Lab'}</span>
                                <div class="batch-grid">${batchHtml}</div>
                            `;
                        }
                    } else if (isPractical) {
                        td.className = 'slot-cell practical-cell';
                        td.innerHTML = `
                            <div class="subject">${escapeHtmlDisplay(entry.subjectName)}</div>
                            <span class="badge bg-success mb-1">Lab</span>
                            <div class="teacher"><i class="bi bi-person"></i> ${escapeHtmlDisplay(entry.teacherName)}</div>
                            <div class="room"><i class="bi bi-door-open"></i> ${escapeHtmlDisplay(entry.roomName)}</div>
                        `;
                    } else {
                        td.className = 'slot-cell';
                        td.innerHTML = `
                            <div class="subject">${escapeHtmlDisplay(entry.subjectName)}</div>
                            <div class="teacher"><i class="bi bi-person"></i> ${escapeHtmlDisplay(entry.teacherName)}</div>
                            <div class="room"><i class="bi bi-door-open"></i> ${escapeHtmlDisplay(entry.roomName)}</div>
                        `;
                    }
                } else {
                    td.className = 'slot-cell empty';
                    td.textContent = '-';
                }
            }
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    container.textContent = '';
    container.appendChild(wrapper);
}

// Listen for class selection changes
document.addEventListener('DOMContentLoaded', () => {
    const classSelect = document.getElementById('timetableClass');
    if (classSelect) {
        classSelect.addEventListener('change', async () => {
            const classId = classSelect.value;
            const batchSelect = document.getElementById('timetableBatchFilter');
            if (batchSelect) batchSelect.value = '';
            if (classId) {
                await displayTimetable(classId);
            } else {
                const container = document.getElementById('timetableContainer');
                container.textContent = '';
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'empty-state';
                emptyDiv.innerHTML = '<i class="bi bi-calendar-x"></i><h5>No Timetable Generated</h5><p>Click "Generate Timetable" to create a schedule</p>';
                container.appendChild(emptyDiv);
            }
        });
    }
});
