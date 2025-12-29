// Faculty Dashboard Logic

let currentTeacherId = null;
let currentUserData = null;
let noticesData = {};

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

        // Load timetable
        await loadFacultyTimetable();

        // Load notices
        await loadNotices();

        // Setup real-time listeners
        setupRealtimeListener();
        setupNoticesListener();

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
