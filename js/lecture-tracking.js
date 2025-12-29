// Lecture Tracking Module
// Handles daily lecture status marking and progress tracking

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Get day name from date
function getDayName(dateStr) {
    const date = new Date(dateStr);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

// Get short day name for slot ID (Mon -> Mon, Tuesday -> Tue)
function getShortDayName(fullDay) {
    const dayMap = {
        'Monday': 'Mon',
        'Tuesday': 'Tue',
        'Wednesday': 'Wed',
        'Thursday': 'Thu',
        'Friday': 'Fri',
        'Saturday': 'Sat',
        'Sunday': 'Sun'
    };
    return dayMap[fullDay] || fullDay.substring(0, 3);
}

// Check if a date is a weekday
function isWeekday(dateStr) {
    const day = getDayName(dateStr);
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day);
}

// Mark lecture status
async function markLectureStatus(classId, date, slotId, status, scheduledTeacherId, actualTeacherId, subjectId, substituteReason = '') {
    const record = {
        status: status, // 'conducted', 'absent', 'substituted'
        scheduledTeacherId: scheduledTeacherId,
        actualTeacherId: actualTeacherId || scheduledTeacherId,
        subjectId: subjectId,
        substituteReason: substituteReason,
        markedAt: Date.now(),
        markedBy: auth.currentUser.uid
    };

    try {
        await database.ref(`lectureRecords/${classId}/${date}/${slotId}`).set(record);
        return { success: true };
    } catch (error) {
        console.error('Error marking lecture:', error);
        return { success: false, error: error.message };
    }
}

// Get lecture record for a specific slot
async function getLectureRecord(classId, date, slotId) {
    try {
        const snapshot = await database.ref(`lectureRecords/${classId}/${date}/${slotId}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Error fetching lecture record:', error);
        return null;
    }
}

// Get all lecture records for a class on a date
async function getClassLectureRecords(classId, date) {
    try {
        const snapshot = await database.ref(`lectureRecords/${classId}/${date}`).once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error('Error fetching class lecture records:', error);
        return {};
    }
}

// Get all lecture records for a class (all dates)
async function getAllClassLectureRecords(classId) {
    try {
        const snapshot = await database.ref(`lectureRecords/${classId}`).once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error('Error fetching all class lecture records:', error);
        return {};
    }
}

// Calculate completed lectures for a subject in a class
async function getCompletedLectures(subjectId, classId) {
    const records = await getAllClassLectureRecords(classId);
    let count = 0;

    Object.values(records).forEach(dateRecords => {
        Object.values(dateRecords).forEach(record => {
            if (record.subjectId === subjectId &&
                (record.status === 'conducted' || record.status === 'substituted')) {
                count++;
            }
        });
    });

    return count;
}

// Calculate progress for all subjects in a class
async function getClassSubjectProgress(classId, subjects) {
    const records = await getAllClassLectureRecords(classId);
    const progress = {};

    // Initialize progress for all subjects
    Object.entries(subjects).forEach(([subjectId, subject]) => {
        if (subject.classId === classId) {
            progress[subjectId] = {
                subjectId,
                subjectName: subject.name,
                subjectCode: subject.code || subjectId,
                totalLectures: subject.totalLectures || 0,
                completedLectures: 0,
                absentLectures: 0
            };
        }
    });

    // Count from records
    Object.values(records).forEach(dateRecords => {
        Object.values(dateRecords).forEach(record => {
            if (progress[record.subjectId]) {
                if (record.status === 'conducted' || record.status === 'substituted') {
                    progress[record.subjectId].completedLectures++;
                } else if (record.status === 'absent') {
                    progress[record.subjectId].absentLectures++;
                }
            }
        });
    });

    // Calculate percentages
    Object.values(progress).forEach(p => {
        p.remainingLectures = Math.max(0, p.totalLectures - p.completedLectures);
        p.progressPercent = p.totalLectures > 0
            ? Math.round((p.completedLectures / p.totalLectures) * 100)
            : 0;
    });

    return progress;
}

// Get teacher's conducted lectures count
async function getTeacherConductedLectures(teacherId) {
    try {
        const snapshot = await database.ref('lectureRecords').once('value');
        const allRecords = snapshot.val() || {};
        let count = 0;

        Object.values(allRecords).forEach(classRecords => {
            Object.values(classRecords).forEach(dateRecords => {
                Object.values(dateRecords).forEach(record => {
                    if (record.actualTeacherId === teacherId &&
                        (record.status === 'conducted' || record.status === 'substituted')) {
                        count++;
                    }
                });
            });
        });

        return count;
    } catch (error) {
        console.error('Error fetching teacher conducted lectures:', error);
        return 0;
    }
}

// Get teacher's lecture history
async function getTeacherLectureHistory(teacherId, limit = 50) {
    try {
        const snapshot = await database.ref('lectureRecords').once('value');
        const allRecords = snapshot.val() || {};
        const history = [];

        Object.entries(allRecords).forEach(([classId, classRecords]) => {
            Object.entries(classRecords).forEach(([date, dateRecords]) => {
                Object.entries(dateRecords).forEach(([slotId, record]) => {
                    if (record.scheduledTeacherId === teacherId || record.actualTeacherId === teacherId) {
                        history.push({
                            classId,
                            date,
                            slotId,
                            ...record,
                            wasSubstitute: record.scheduledTeacherId !== record.actualTeacherId &&
                                           record.actualTeacherId === teacherId
                        });
                    }
                });
            });
        });

        // Sort by date descending
        history.sort((a, b) => new Date(b.date) - new Date(a.date));

        return history.slice(0, limit);
    } catch (error) {
        console.error('Error fetching teacher lecture history:', error);
        return [];
    }
}

// Get available teachers for substitution (not scheduled at the same slot)
async function getAvailableSubstituteTeachers(excludeTeacherId, day, period, allTimetables, teachers) {
    const busyTeachers = new Set();
    const slotPattern = `${getShortDayName(day)}-P${period}`;

    // Find all teachers busy at this slot
    Object.values(allTimetables).forEach(classSchedule => {
        Object.entries(classSchedule).forEach(([slotId, entry]) => {
            if (slotId === slotPattern && entry.teacherId) {
                busyTeachers.add(entry.teacherId);
            }
        });
    });

    // Return teachers not busy at this slot
    const available = Object.entries(teachers)
        .filter(([id, t]) => id !== excludeTeacherId && !busyTeachers.has(id))
        .map(([id, t]) => ({
            id,
            name: t.name,
            dept: t.dept
        }));

    return available;
}

// Format date for display
function formatDateDisplay(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Get status badge HTML
function getLectureStatusBadge(status) {
    const badges = {
        'conducted': '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Conducted</span>',
        'absent': '<span class="badge bg-danger"><i class="bi bi-x-circle"></i> Absent</span>',
        'substituted': '<span class="badge bg-warning text-dark"><i class="bi bi-arrow-repeat"></i> Substituted</span>',
        'pending': '<span class="badge bg-secondary"><i class="bi bi-clock"></i> Pending</span>'
    };
    return badges[status] || badges['pending'];
}

// Export functions
window.LectureTracking = {
    getTodayDate,
    getDayName,
    getShortDayName,
    isWeekday,
    markLectureStatus,
    getLectureRecord,
    getClassLectureRecords,
    getAllClassLectureRecords,
    getCompletedLectures,
    getClassSubjectProgress,
    getTeacherConductedLectures,
    getTeacherLectureHistory,
    getAvailableSubstituteTeachers,
    formatDateDisplay,
    getLectureStatusBadge
};
