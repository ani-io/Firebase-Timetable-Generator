// Faculty Dashboard Logic

let currentTeacherId = null;
let currentUserData = null;
let noticesData = {};
let allTimetables = {};
let slotsData = {};
let subjectsData = {};
let classesData = {};
let teachersData = {};
let selectedTrackingDate = null;

// Initialize faculty dashboard
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication and role
        const { user, userData } = await checkAuthState('faculty');
        currentUserData = userData;
        currentTeacherId = userData.teacherId;

        // Update UI with user info
        document.getElementById('userName').textContent = userData.name || 'Faculty';
        document.getElementById('welcomeName').textContent = userData.name || 'Faculty';
        document.getElementById('userDept').textContent = userData.dept || 'Department';
        document.getElementById('userAvatar').textContent = (userData.name || 'F').charAt(0).toUpperCase();

        if (!currentTeacherId) {
            showError('Teacher ID not found in your profile. Please contact administrator.');
            return;
        }

        // Setup navigation
        setupNavigation();

        // Setup notice form
        setupNoticeForm();

        // Load all required data
        await loadAllData();

        // Load timetable
        await loadFacultyTimetable();

        // Load notices
        await loadNotices();

        // Setup lecture tracking
        setupLectureTracking();

        // Setup real-time listeners
        setupRealtimeListener();
        setupNoticesListener();
        setupLectureRecordsListener();

    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'index.html';
    }
});

// Navigation
function setupNavigation() {
    document.querySelectorAll('.sidebar .nav-link[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            showSection(section);
        });
    });
}

function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });

    // Show selected section
    const section = document.getElementById(`${sectionName}Section`);
    if (section) {
        section.style.display = 'block';
    }

    // Update nav active state
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.section === sectionName) {
            link.classList.add('active');
        }
    });
}

// Load faculty timetable
async function loadFacultyTimetable() {
    const container = document.getElementById('timetableContainer');
    const loading = document.getElementById('loading');

    try {
        // Fetch all timetables and slots
        const [timetablesSnap, slotsSnap] = await Promise.all([
            database.ref('timetables').once('value'),
            database.ref('slots').once('value')
        ]);

        const allTimetables = timetablesSnap.val() || {};
        const slots = slotsSnap.val() || {};

        // Filter entries for current teacher
        const facultySchedule = {};
        const assignedClasses = new Set();
        const assignedSubjects = new Set();

        Object.entries(allTimetables).forEach(([classId, classSchedule]) => {
            Object.entries(classSchedule || {}).forEach(([slotId, entry]) => {
                if (entry.teacherId === currentTeacherId) {
                    facultySchedule[slotId] = {
                        ...entry,
                        classId
                    };
                    assignedClasses.add(classId);
                    assignedSubjects.add(entry.subjectId);
                }
            });
        });

        // Update stats
        document.getElementById('lectureCount').textContent = Object.keys(facultySchedule).length;
        document.getElementById('classCount').textContent = assignedClasses.size;
        document.getElementById('subjectCount').textContent = assignedSubjects.size;

        // Hide loading
        loading.classList.remove('show');

        if (Object.keys(facultySchedule).length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-calendar-x"></i>
                    <h5>No Schedule Found</h5>
                    <p>You don't have any classes scheduled yet. Please contact the administrator.</p>
                </div>
            `;
            return;
        }

        // Build timetable grid
        renderTimetable(facultySchedule, slots);

    } catch (error) {
        console.error('Error loading timetable:', error);
        loading.classList.remove('show');
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error loading timetable: ${error.message}
            </div>
        `;
    }
}

// Render timetable grid with breaks
function renderTimetable(schedule, slots) {
    const container = document.getElementById('timetableContainer');

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
        container.innerHTML = `
            <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle"></i> No time slots found.
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
                const entry = schedule[slotId];

                if (entry) {
                    const isPractical = entry.subjectType === 'practical';
                    const cellClass = isPractical ? 'practical-cell' : '';
                    html += `
                        <td class="slot-cell ${cellClass}">
                            <div class="subject">${entry.subjectName}</div>
                            ${isPractical ? '<span class="badge bg-success mb-1">Lab</span>' : ''}
                            <div class="teacher"><i class="bi bi-building"></i> ${entry.classId}</div>
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

// Setup real-time listener for timetable updates
function setupRealtimeListener() {
    database.ref('timetables').on('value', () => {
        loadFacultyTimetable();
    });
}

// Show error message
function showError(message) {
    const container = document.getElementById('timetableContainer');
    const loading = document.getElementById('loading');
    loading.classList.remove('show');
    container.innerHTML = `
        <div class="alert alert-danger">
            <i class="bi bi-exclamation-triangle"></i> ${message}
        </div>
    `;
}

// ==================== NOTICE OPERATIONS ====================

// Load notices
async function loadNotices() {
    const snapshot = await database.ref('notices').once('value');
    noticesData = snapshot.val() || {};
    renderNotices();
}

// Setup notice form
function setupNoticeForm() {
    const form = document.getElementById('noticeForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addNotice();
        });
    }
}

// Render notices
function renderNotices() {
    const container = document.getElementById('noticesContainer');
    if (!container) return;

    // Filter notices that faculty can see (all or faculty-targeted)
    const notices = Object.entries(noticesData)
        .filter(([_, data]) => data.audience === 'all' || data.audience === 'faculty')
        .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt));

    if (notices.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-megaphone"></i>
                <h5>No Notices Yet</h5>
                <p>Create a notice to share with students</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notices.map(([id, data]) => {
        const priorityClass = data.priority === 'urgent' ? 'danger' :
                              data.priority === 'important' ? 'warning' : 'info';
        const audienceLabel = data.audience === 'all' ? 'Everyone' :
                              data.audience === 'students' ? 'Students Only' : 'Faculty Only';
        const date = new Date(data.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // Only show edit/delete for own notices
        const isOwnNotice = data.authorId === auth.currentUser.uid;
        const actions = isOwnNotice ? `
            <div class="notice-actions">
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editNotice('${id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteNotice('${id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        ` : '';

        return `
            <div class="notice-card mb-3 p-3 border rounded ${data.priority === 'urgent' ? 'border-danger' : ''}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <h6 class="mb-0">${data.title}</h6>
                            <span class="badge bg-${priorityClass}">${data.priority}</span>
                            <span class="badge bg-secondary">${audienceLabel}</span>
                        </div>
                        <p class="mb-2 text-muted">${data.content}</p>
                        <small class="text-muted">
                            <i class="bi bi-person"></i> ${data.authorName} |
                            <i class="bi bi-clock"></i> ${date}
                        </small>
                    </div>
                    ${actions}
                </div>
            </div>
        `;
    }).join('');
}

// Add notice
async function addNotice() {
    const title = document.getElementById('noticeTitle').value.trim();
    const content = document.getElementById('noticeContent').value.trim();
    const priority = document.getElementById('noticePriority').value;
    const audience = document.getElementById('noticeAudience').value;

    const noticeId = 'NOT-' + Date.now();

    const noticeData = {
        title,
        content,
        priority,
        audience,
        authorId: auth.currentUser.uid,
        authorName: document.getElementById('userName').textContent,
        authorRole: 'faculty',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    try {
        await database.ref(`notices/${noticeId}`).set(noticeData);
        showToast('Notice published successfully!', 'success');
        document.getElementById('noticeForm').reset();
    } catch (error) {
        console.error('Error creating notice:', error);
        showToast('Error publishing notice: ' + error.message, 'danger');
    }
}

// Edit notice
function editNotice(noticeId) {
    const data = noticesData[noticeId];

    showEditModal('Edit Notice', `
        <div class="mb-3">
            <label class="form-label">Title</label>
            <input type="text" class="form-control" id="editNoticeTitle" value="${data.title}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Content</label>
            <textarea class="form-control" id="editNoticeContent" rows="4" required>${data.content}</textarea>
        </div>
        <div class="mb-3">
            <label class="form-label">Priority</label>
            <select class="form-select" id="editNoticePriority">
                <option value="normal" ${data.priority === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="important" ${data.priority === 'important' ? 'selected' : ''}>Important</option>
                <option value="urgent" ${data.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Target Audience</label>
            <select class="form-select" id="editNoticeAudience">
                <option value="all" ${data.audience === 'all' ? 'selected' : ''}>Everyone</option>
                <option value="students" ${data.audience === 'students' ? 'selected' : ''}>Students Only</option>
            </select>
        </div>
    `, async () => {
        const title = document.getElementById('editNoticeTitle').value.trim();
        const content = document.getElementById('editNoticeContent').value.trim();
        const priority = document.getElementById('editNoticePriority').value;
        const audience = document.getElementById('editNoticeAudience').value;

        await database.ref(`notices/${noticeId}`).update({
            title, content, priority, audience,
            updatedAt: new Date().toISOString()
        });
        showToast('Notice updated successfully!', 'success');
    });
}

// Delete notice
async function deleteNotice(noticeId) {
    if (confirm('Are you sure you want to delete this notice?')) {
        try {
            await database.ref(`notices/${noticeId}`).remove();
            showToast('Notice deleted successfully!', 'success');
        } catch (error) {
            showToast('Error deleting notice: ' + error.message, 'danger');
        }
    }
}

// Setup notices real-time listener
function setupNoticesListener() {
    database.ref('notices').on('value', (snapshot) => {
        noticesData = snapshot.val() || {};
        renderNotices();
    });
}

// ==================== UTILITY FUNCTIONS ====================

function showEditModal(title, bodyContent, onSave) {
    document.getElementById('editModalTitle').textContent = title;
    document.getElementById('editModalBody').innerHTML = bodyContent;

    const saveBtn = document.getElementById('saveEditBtn');
    const modal = new bootstrap.Modal(document.getElementById('editModal'));

    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

    newSaveBtn.addEventListener('click', async () => {
        try {
            await onSave();
            modal.hide();
        } catch (error) {
            showToast('Error: ' + error.message, 'danger');
        }
    });

    modal.show();
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast show';
    toast.innerHTML = `
        <div class="toast-header bg-${type} text-white">
            <i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-circle'} me-2"></i>
            <strong class="me-auto">${type === 'success' ? 'Success' : 'Error'}</strong>
            <button type="button" class="btn-close btn-close-white" onclick="this.closest('.toast').remove()"></button>
        </div>
        <div class="toast-body">${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ==================== LECTURE TRACKING ====================

// Load all required data for lecture tracking
async function loadAllData() {
    try {
        const [timetablesSnap, slotsSnap, subjectsSnap, classesSnap, teachersSnap] = await Promise.all([
            database.ref('timetables').once('value'),
            database.ref('slots').once('value'),
            database.ref('subjects').once('value'),
            database.ref('classes').once('value'),
            database.ref('teachers').once('value')
        ]);

        allTimetables = timetablesSnap.val() || {};
        slotsData = slotsSnap.val() || {};
        subjectsData = subjectsSnap.val() || {};
        classesData = classesSnap.val() || {};
        teachersData = teachersSnap.val() || {};
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Setup lecture tracking UI
function setupLectureTracking() {
    // Initialize date to today
    selectedTrackingDate = LectureTracking.getTodayDate();
    const dateInput = document.getElementById('trackingDate');
    if (dateInput) {
        dateInput.value = selectedTrackingDate;
        dateInput.addEventListener('change', (e) => {
            selectedTrackingDate = e.target.value;
            loadTodayLectures();
        });
    }

    // Date navigation buttons
    document.getElementById('prevDayBtn')?.addEventListener('click', () => {
        const date = new Date(selectedTrackingDate);
        date.setDate(date.getDate() - 1);
        selectedTrackingDate = date.toISOString().split('T')[0];
        document.getElementById('trackingDate').value = selectedTrackingDate;
        loadTodayLectures();
    });

    document.getElementById('nextDayBtn')?.addEventListener('click', () => {
        const date = new Date(selectedTrackingDate);
        date.setDate(date.getDate() + 1);
        selectedTrackingDate = date.toISOString().split('T')[0];
        document.getElementById('trackingDate').value = selectedTrackingDate;
        loadTodayLectures();
    });

    document.getElementById('todayBtn')?.addEventListener('click', () => {
        selectedTrackingDate = LectureTracking.getTodayDate();
        document.getElementById('trackingDate').value = selectedTrackingDate;
        loadTodayLectures();
    });

    // Setup substitution modal
    setupSubstitutionModal();

    // Load initial data
    loadTodayLectures();
    loadLectureHistory();
}

// Load today's lectures for the faculty
async function loadTodayLectures() {
    const container = document.getElementById('todayLecturesContainer');
    const loading = document.getElementById('lecturesLoading');
    const dateDisplay = document.getElementById('trackingDateDisplay');

    if (!container) return;

    // Update date display
    if (dateDisplay) {
        dateDisplay.textContent = LectureTracking.formatDateDisplay(selectedTrackingDate);
    }

    // Show loading
    if (loading) loading.classList.add('show');

    const dayName = LectureTracking.getDayName(selectedTrackingDate);
    const shortDay = LectureTracking.getShortDayName(dayName);

    // Check if it's a weekday
    if (!LectureTracking.isWeekday(selectedTrackingDate)) {
        if (loading) loading.classList.remove('show');
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-calendar-x"></i>
                <h5>No Lectures Scheduled</h5>
                <p>It's ${dayName} - no lectures are scheduled on weekends.</p>
            </div>
        `;
        return;
    }

    // Get faculty's lectures for this day
    const facultyLectures = [];
    Object.entries(allTimetables).forEach(([classId, classSchedule]) => {
        Object.entries(classSchedule || {}).forEach(([slotId, entry]) => {
            if (entry.teacherId === currentTeacherId && slotId.startsWith(shortDay)) {
                facultyLectures.push({
                    classId,
                    slotId,
                    ...entry
                });
            }
        });
    });

    // Sort by period
    facultyLectures.sort((a, b) => {
        const periodA = parseInt(a.slotId.split('-P')[1]);
        const periodB = parseInt(b.slotId.split('-P')[1]);
        return periodA - periodB;
    });

    // Get existing records for these lectures
    const lectureRecords = {};
    for (const lecture of facultyLectures) {
        const record = await LectureTracking.getLectureRecord(lecture.classId, selectedTrackingDate, lecture.slotId);
        if (record) {
            lectureRecords[`${lecture.classId}-${lecture.slotId}`] = record;
        }
    }

    if (loading) loading.classList.remove('show');

    if (facultyLectures.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-calendar-check"></i>
                <h5>No Lectures Today</h5>
                <p>You don't have any lectures scheduled for ${dayName}.</p>
            </div>
        `;
        return;
    }

    // Check if date is in future
    const today = new Date(LectureTracking.getTodayDate());
    const selectedDate = new Date(selectedTrackingDate);
    const isFuture = selectedDate > today;
    const isPast = selectedDate < today;

    // Render lectures
    container.innerHTML = facultyLectures.map(lecture => {
        const slot = Object.values(slotsData).find(s =>
            s.day === dayName && s.period === parseInt(lecture.slotId.split('-P')[1])
        );
        const record = lectureRecords[`${lecture.classId}-${lecture.slotId}`];
        const className = classesData[lecture.classId]?.name || lecture.classId;
        const isPractical = lecture.subjectType === 'practical';

        let statusHtml = '';
        let actionsHtml = '';

        if (record) {
            statusHtml = LectureTracking.getLectureStatusBadge(record.status);
            if (record.status === 'substituted' && record.actualTeacherId !== record.scheduledTeacherId) {
                const substituteTeacher = teachersData[record.actualTeacherId]?.name || 'Unknown';
                statusHtml += ` <small class="text-muted">(by ${substituteTeacher})</small>`;
            }
            actionsHtml = `<button class="btn btn-sm btn-outline-secondary" disabled>
                <i class="bi bi-check"></i> Marked
            </button>`;
        } else if (isFuture) {
            statusHtml = '<span class="badge bg-secondary"><i class="bi bi-clock"></i> Upcoming</span>';
            actionsHtml = `<button class="btn btn-sm btn-outline-secondary" disabled>
                <i class="bi bi-lock"></i> Future Date
            </button>`;
        } else {
            statusHtml = '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-circle"></i> Not Marked</span>';
            actionsHtml = `
                <button class="btn btn-sm btn-success me-2" onclick="markConducted('${lecture.classId}', '${lecture.slotId}', '${lecture.subjectId}')">
                    <i class="bi bi-check-circle"></i> Conducted
                </button>
                <button class="btn btn-sm btn-danger" onclick="openSubstitutionModal('${lecture.classId}', '${lecture.slotId}', '${lecture.subjectId}', '${lecture.subjectName}', '${className}', '${slot?.start || ''} - ${slot?.end || ''}')">
                    <i class="bi bi-x-circle"></i> Absent
                </button>
            `;
        }

        return `
            <div class="lecture-card p-3 mb-3 border rounded ${record ? 'border-success bg-light' : ''}">
                <div class="row align-items-center">
                    <div class="col-md-2 text-center">
                        <h5 class="mb-0 text-primary">Period ${lecture.slotId.split('-P')[1]}</h5>
                        <small class="text-muted">${slot?.start || ''} - ${slot?.end || ''}</small>
                    </div>
                    <div class="col-md-4">
                        <h6 class="mb-1">${lecture.subjectName}</h6>
                        ${isPractical ? '<span class="badge bg-success me-1">Lab</span>' : ''}
                        <span class="badge bg-info">${className}</span>
                    </div>
                    <div class="col-md-2">
                        <small class="text-muted"><i class="bi bi-door-open"></i> ${lecture.roomName}</small>
                    </div>
                    <div class="col-md-2 text-center">
                        ${statusHtml}
                    </div>
                    <div class="col-md-2 text-end">
                        ${actionsHtml}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Mark lecture as conducted
async function markConducted(classId, slotId, subjectId) {
    try {
        const result = await LectureTracking.markLectureStatus(
            classId,
            selectedTrackingDate,
            slotId,
            'conducted',
            currentTeacherId,
            currentTeacherId,
            subjectId
        );

        if (result.success) {
            showToast('Lecture marked as conducted!', 'success');
            loadTodayLectures();
            loadLectureHistory();
            loadTeacherProgress();
        } else {
            showToast('Error: ' + result.error, 'danger');
        }
    } catch (error) {
        showToast('Error marking lecture: ' + error.message, 'danger');
    }
}

// Setup substitution modal
function setupSubstitutionModal() {
    const confirmBtn = document.getElementById('confirmAbsentBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmAbsent);
    }
}

// Open substitution modal
async function openSubstitutionModal(classId, slotId, subjectId, subjectName, className, timeSlot) {
    const modal = new bootstrap.Modal(document.getElementById('substitutionModal'));

    // Populate hidden fields
    document.getElementById('subClassId').value = classId;
    document.getElementById('subSlotId').value = slotId;
    document.getElementById('subSubjectId').value = subjectId;
    document.getElementById('subDate').value = selectedTrackingDate;

    // Populate lecture details
    document.getElementById('subLectureDetails').innerHTML = `
        <strong>${subjectName}</strong><br>
        <small>Class: ${className} | Time: ${timeSlot}</small><br>
        <small>Date: ${LectureTracking.formatDateDisplay(selectedTrackingDate)}</small>
    `;

    // Clear reason
    document.getElementById('subReason').value = '';

    // Load available substitute teachers
    const dayName = LectureTracking.getDayName(selectedTrackingDate);
    const period = parseInt(slotId.split('-P')[1]);
    const availableTeachers = await LectureTracking.getAvailableSubstituteTeachers(
        currentTeacherId,
        dayName,
        period,
        allTimetables,
        teachersData
    );

    const selectEl = document.getElementById('subTeacher');
    selectEl.innerHTML = '<option value="">-- No Substitute (Mark Absent) --</option>';
    availableTeachers.forEach(teacher => {
        selectEl.innerHTML += `<option value="${teacher.id}">${teacher.name} (${teacher.dept || 'N/A'})</option>`;
    });

    modal.show();
}

// Confirm absent/substitution
async function confirmAbsent() {
    const classId = document.getElementById('subClassId').value;
    const slotId = document.getElementById('subSlotId').value;
    const subjectId = document.getElementById('subSubjectId').value;
    const date = document.getElementById('subDate').value;
    const reason = document.getElementById('subReason').value;
    const substituteTeacherId = document.getElementById('subTeacher').value;

    const status = substituteTeacherId ? 'substituted' : 'absent';
    const actualTeacherId = substituteTeacherId || currentTeacherId;

    try {
        const result = await LectureTracking.markLectureStatus(
            classId,
            date,
            slotId,
            status,
            currentTeacherId,
            actualTeacherId,
            subjectId,
            reason
        );

        if (result.success) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('substitutionModal'));
            modal.hide();

            if (substituteTeacherId) {
                const subName = teachersData[substituteTeacherId]?.name || 'substitute';
                showToast(`Lecture marked as substituted by ${subName}`, 'success');
            } else {
                showToast('Lecture marked as absent', 'success');
            }

            loadTodayLectures();
            loadLectureHistory();
            loadTeacherProgress();
        } else {
            showToast('Error: ' + result.error, 'danger');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'danger');
    }
}

// Load lecture history
async function loadLectureHistory() {
    const container = document.getElementById('lectureHistoryContainer');
    if (!container) return;

    try {
        const history = await LectureTracking.getTeacherLectureHistory(currentTeacherId, 20);

        if (history.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="bi bi-clock-history"></i> No lecture history yet
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Subject</th>
                            <th>Class</th>
                            <th>Period</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.map(record => {
                            const subject = subjectsData[record.subjectId];
                            const className = classesData[record.classId]?.name || record.classId;
                            const period = record.slotId.split('-P')[1];
                            const date = new Date(record.date).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric'
                            });

                            return `
                                <tr>
                                    <td>${date}</td>
                                    <td>${subject?.name || record.subjectId}</td>
                                    <td>${className}</td>
                                    <td>P${period}</td>
                                    <td>${LectureTracking.getLectureStatusBadge(record.status)}
                                        ${record.wasSubstitute ? '<small class="text-info">(Substitution)</small>' : ''}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading history: ${error.message}</div>`;
    }
}

// Load teacher progress statistics
async function loadTeacherProgress() {
    const conductedEl = document.getElementById('totalConducted');
    const substitutedEl = document.getElementById('totalSubstituted');
    const absentEl = document.getElementById('totalAbsent');
    const rateEl = document.getElementById('attendanceRate');
    const progressContainer = document.getElementById('subjectProgressContainer');

    if (!conductedEl) return;

    try {
        const history = await LectureTracking.getTeacherLectureHistory(currentTeacherId, 500);

        let conducted = 0;
        let substituted = 0;
        let absent = 0;
        let substitutionsTaken = 0;

        history.forEach(record => {
            if (record.scheduledTeacherId === currentTeacherId) {
                if (record.status === 'conducted') conducted++;
                else if (record.status === 'absent') absent++;
                else if (record.status === 'substituted') {
                    if (record.actualTeacherId === currentTeacherId) {
                        conducted++;
                    } else {
                        // Someone else substituted for this teacher
                        absent++;
                    }
                }
            }
            if (record.wasSubstitute) {
                substitutionsTaken++;
            }
        });

        const total = conducted + absent;
        const rate = total > 0 ? Math.round((conducted / total) * 100) : 100;

        conductedEl.textContent = conducted;
        substitutedEl.textContent = substitutionsTaken;
        absentEl.textContent = absent;
        rateEl.textContent = rate + '%';

        // Load subject-wise progress
        if (progressContainer) {
            await loadSubjectProgress(progressContainer);
        }
    } catch (error) {
        console.error('Error loading progress:', error);
    }
}

// Load subject-wise progress for faculty
async function loadSubjectProgress(container) {
    // Get subjects assigned to this teacher
    const assignedSubjects = [];
    Object.entries(subjectsData).forEach(([subjectId, subject]) => {
        if (subject.teacherId === currentTeacherId) {
            assignedSubjects.push({ id: subjectId, ...subject });
        }
    });

    if (assignedSubjects.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted py-3">
                No subjects assigned to you.
            </div>
        `;
        return;
    }

    // Calculate progress for each subject
    const progressData = [];
    for (const subject of assignedSubjects) {
        const completed = await LectureTracking.getCompletedLectures(subject.id, subject.classId);
        const total = subject.totalLectures || 0;
        const remaining = Math.max(0, total - completed);
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

        progressData.push({
            ...subject,
            completed,
            remaining,
            percent
        });
    }

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        <th>Subject</th>
                        <th>Class</th>
                        <th>Required</th>
                        <th>Completed</th>
                        <th>Remaining</th>
                        <th>Progress</th>
                    </tr>
                </thead>
                <tbody>
                    ${progressData.map(subject => {
                        const className = classesData[subject.classId]?.name || subject.classId;
                        const progressClass = subject.percent >= 80 ? 'bg-success' :
                                              subject.percent >= 50 ? 'bg-warning' : 'bg-danger';

                        return `
                            <tr>
                                <td><strong>${subject.name}</strong><br><small class="text-muted">${subject.code || ''}</small></td>
                                <td>${className}</td>
                                <td>${subject.totalLectures || 0}</td>
                                <td>${subject.completed}</td>
                                <td>${subject.remaining}</td>
                                <td style="min-width: 150px;">
                                    <div class="progress" style="height: 20px;">
                                        <div class="progress-bar ${progressClass}" style="width: ${subject.percent}%">
                                            ${subject.percent}%
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Setup real-time listener for lecture records
function setupLectureRecordsListener() {
    database.ref('lectureRecords').on('value', () => {
        // Reload data when records change
        loadTodayLectures();
        loadLectureHistory();
        loadTeacherProgress();
    });
}

// Override showSection to load progress when switching
const originalShowSection = showSection;
showSection = function(sectionName) {
    originalShowSection(sectionName);

    if (sectionName === 'lectureTracking') {
        loadTodayLectures();
        loadLectureHistory();
    } else if (sectionName === 'myProgress') {
        loadTeacherProgress();
    }
};
