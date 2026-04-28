// Student Dashboard Logic

let currentClassId = null;
let currentUserData = null;
let currentLabBatch = null;
let noticesData = {};
let showAllBatchesView = false; // Toggle state for batch view

// Helper function to escape HTML for display
function escapeHtmlStudent(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Initialize student dashboard
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication and role
        const { userData } = await checkAuthState('student');
        currentUserData = userData;
        currentClassId = userData.classId;
        currentLabBatch = userData.labBatch || null;

        // Update UI with user info
        document.getElementById('userName').textContent = userData.name || 'Student';
        document.getElementById('welcomeName').textContent = userData.name || 'Student';
        document.getElementById('userAvatar').textContent = (userData.name || 'S').charAt(0).toUpperCase();

        if (!currentClassId) {
            showError('Class ID not found in your profile. Please contact administrator.');
            return;
        }

        // Fetch class name
        const classSnap = await database.ref(`classes/${currentClassId}`).once('value');
        const classData = classSnap.val();
        const className = classData?.name || currentClassId;

        document.getElementById('userClass').textContent = className;
        document.getElementById('classDisplayName').textContent = className;

        // Show lab batch if assigned
        if (currentLabBatch) {
            const batchInfo = document.getElementById('userBatchInfo');
            if (batchInfo) {
                batchInfo.textContent = `Lab Batch: ${currentLabBatch}`;
                batchInfo.style.display = 'inline-block';
            }
        }

        // Setup navigation
        setupNavigation();

        // Load timetable
        await loadStudentTimetable();

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

// Load student timetable
async function loadStudentTimetable() {
    const container = document.getElementById('timetableContainer');
    const loading = document.getElementById('loading');

    try {
        // Fetch class timetable, slots, and class data
        const [timetableSnap, slotsSnap, classSnap] = await Promise.all([
            database.ref(`timetables/${currentClassId}`).once('value'),
            database.ref('slots').once('value'),
            database.ref(`classes/${currentClassId}`).once('value')
        ]);

        const timetable = timetableSnap.val() || {};
        const slots = slotsSnap.val() || {};
        const classData = classSnap.val() || {};

        // Check if class has lab batches - show/hide toggle
        const batchViewToggle = document.getElementById('batchViewToggle');
        const hasBatches = classData.labBatches && classData.labBatches.length > 0;
        if (batchViewToggle) {
            batchViewToggle.style.display = (hasBatches && currentLabBatch) ? 'block' : 'none';
        }

        // Calculate stats
        const teachers = new Set();
        const subjects = new Set();

        Object.values(timetable).forEach(entry => {
            if (entry && entry.teacherId) teachers.add(entry.teacherId);
            if (entry && entry.subjectId) subjects.add(entry.subjectId);
            // Also count batch schedule teachers/subjects
            if (entry && entry.batchSchedule) {
                Object.values(entry.batchSchedule).forEach(info => {
                    if (info.teacherId) teachers.add(info.teacherId);
                    if (info.subjectId) subjects.add(info.subjectId);
                });
            }
        });

        // Update stats
        document.getElementById('lectureCount').textContent = Object.keys(timetable).length;
        document.getElementById('teacherCount').textContent = teachers.size;
        document.getElementById('subjectCount').textContent = subjects.size;

        // Hide loading
        loading.classList.remove('show');

        if (Object.keys(timetable).length === 0) {
            container.textContent = '';
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            const icon = document.createElement('i');
            icon.className = 'bi bi-calendar-x';
            emptyDiv.appendChild(icon);
            const h5 = document.createElement('h5');
            h5.textContent = 'No Schedule Found';
            emptyDiv.appendChild(h5);
            const p = document.createElement('p');
            p.textContent = "The timetable for your class hasn't been generated yet. Please contact the administrator.";
            emptyDiv.appendChild(p);
            container.appendChild(emptyDiv);
            return;
        }

        // Build timetable grid
        renderTimetable(timetable, slots);

    } catch (error) {
        console.error('Error loading timetable:', error);
        loading.classList.remove('show');
        container.textContent = '';
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-danger';
        const icon = document.createElement('i');
        icon.className = 'bi bi-exclamation-triangle';
        alertDiv.appendChild(icon);
        alertDiv.appendChild(document.createTextNode(' Error loading timetable: ' + (error.message || 'Unknown error')));
        container.appendChild(alertDiv);
    }
}

// Toggle between "My Batch" and "All Batches" view
function toggleBatchView() {
    showAllBatchesView = document.getElementById('showAllBatches')?.checked || false;
    loadStudentTimetable();
}

// Render timetable grid with breaks
function renderTimetable(timetable, slots) {
    const container = document.getElementById('timetableContainer');

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
                    <div class="break-label">${escapeHtmlStudent(periodData.label) || 'Break'}</div>
                </td>`;
            } else {
                const slotId = `${day.substring(0, 3)}-P${periodData.period}`;
                const entry = timetable[slotId];

                if (entry) {
                    const isPractical = entry.subjectType === 'practical';
                    const isBatchPractical = entry.subjectType === 'batch-practical';

                    if (isBatchPractical && entry.batchSchedule) {
                        if (showAllBatchesView) {
                            // Show all batches view (toggled on)
                            const batchEntries = Object.entries(entry.batchSchedule);
                            const uniqueSubjects = new Set(batchEntries.map(([_, info]) => info.subjectId));
                            const isRoundRobin = uniqueSubjects.size > 1;

                            let batchHtml = batchEntries.map(([batch, info]) => {
                                const isMyBatch = batch === currentLabBatch;
                                return `
                                    <div class="batch-item ${isMyBatch ? 'my-batch' : ''}">
                                        <span class="badge ${isMyBatch ? 'bg-primary' : 'bg-info'}">${escapeHtmlStudent(batch)}</span>
                                        ${isRoundRobin ? `<strong class="batch-subject">${escapeHtmlStudent(info.subjectName)}</strong>` : ''}
                                        <small>${escapeHtmlStudent(info.teacherName)}</small>
                                        <small class="text-muted">${escapeHtmlStudent(info.roomName)}</small>
                                    </div>
                                `;
                            }).join('');

                            const headerSubject = isRoundRobin ? 'Batch Practicals' : escapeHtmlStudent(entry.subjectName);
                            html += `
                                <td class="slot-cell batch-practical-cell">
                                    <div class="subject">${headerSubject}</div>
                                    <span class="badge bg-success mb-1">${isRoundRobin ? 'Round-Robin' : 'All Batches'}</span>
                                    <div class="batch-grid">${batchHtml}</div>
                                </td>
                            `;
                        } else {
                            // Show only student's batch view (default)
                            const myBatchInfo = currentLabBatch ? entry.batchSchedule[currentLabBatch] : null;

                            if (myBatchInfo) {
                                // Use batch-specific subject name (for round-robin, this differs per batch)
                                const subjectName = myBatchInfo.subjectName || entry.subjectName;
                                html += `
                                    <td class="slot-cell practical-cell">
                                        <div class="subject">${escapeHtmlStudent(subjectName)}</div>
                                        <span class="badge bg-success mb-1">Lab (${escapeHtmlStudent(currentLabBatch)})</span>
                                        <div class="teacher"><i class="bi bi-person"></i> ${escapeHtmlStudent(myBatchInfo.teacherName)}</div>
                                        <div class="room"><i class="bi bi-door-open"></i> ${escapeHtmlStudent(myBatchInfo.roomName)}</div>
                                    </td>
                                `;
                            } else {
                                // Student has no batch assigned or batch not in schedule - show overview
                                const batchSummary = Object.entries(entry.batchSchedule)
                                    .map(([batch, info]) => `${batch}: ${info.subjectName || entry.subjectName}`)
                                    .join(', ');
                                html += `
                                    <td class="slot-cell practical-cell">
                                        <div class="subject">Batch Practicals</div>
                                        <span class="badge bg-warning text-dark mb-1">Lab</span>
                                        <div class="text-muted small">${escapeHtmlStudent(batchSummary)}</div>
                                        <div class="text-muted small"><i class="bi bi-info-circle"></i> Check your batch assignment</div>
                                    </td>
                                `;
                            }
                        }
                    } else if (isPractical) {
                        // Regular practical
                        html += `
                            <td class="slot-cell practical-cell">
                                <div class="subject">${escapeHtmlStudent(entry.subjectName)}</div>
                                <span class="badge bg-success mb-1">Lab</span>
                                <div class="teacher"><i class="bi bi-person"></i> ${escapeHtmlStudent(entry.teacherName)}</div>
                                <div class="room"><i class="bi bi-door-open"></i> ${escapeHtmlStudent(entry.roomName)}</div>
                            </td>
                        `;
                    } else {
                        // Theory
                        html += `
                            <td class="slot-cell">
                                <div class="subject">${escapeHtmlStudent(entry.subjectName)}</div>
                                <div class="teacher"><i class="bi bi-person"></i> ${escapeHtmlStudent(entry.teacherName)}</div>
                                <div class="room"><i class="bi bi-door-open"></i> ${escapeHtmlStudent(entry.roomName)}</div>
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

// Setup real-time listener for timetable updates
function setupRealtimeListener() {
    database.ref(`timetables/${currentClassId}`).on('value', () => {
        loadStudentTimetable();
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

// Render notices (view only for students)
function renderNotices() {
    const container = document.getElementById('noticesContainer');
    if (!container) return;

    // Filter notices that students can see (all or student-targeted)
    const notices = Object.entries(noticesData)
        .filter(([_, data]) => data.audience === 'all' || data.audience === 'students')
        .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt));

    if (notices.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-megaphone"></i>
                <h5>No Notices</h5>
                <p>There are no notices at this time</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notices.map(([id, data]) => {
        const priorityClass = data.priority === 'urgent' ? 'danger' :
                              data.priority === 'important' ? 'warning' : 'info';
        const date = new Date(data.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        return `
            <div class="notice-card mb-3 p-3 border rounded ${data.priority === 'urgent' ? 'border-danger' : ''}">
                <div class="d-flex align-items-center gap-2 mb-2">
                    <h6 class="mb-0">${data.title}</h6>
                    <span class="badge bg-${priorityClass}">${data.priority}</span>
                </div>
                <p class="mb-2">${data.content}</p>
                <small class="text-muted">
                    <i class="bi bi-person"></i> ${data.authorName} (${data.authorRole}) |
                    <i class="bi bi-clock"></i> ${date}
                </small>
            </div>
        `;
    }).join('');
}

// Setup notices real-time listener
function setupNoticesListener() {
    database.ref('notices').on('value', (snapshot) => {
        noticesData = snapshot.val() || {};
        renderNotices();
    });
}
