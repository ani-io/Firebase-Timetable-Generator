// Admin Dashboard Logic

// Data cache
let classesData = {};
let roomsData = {};
let teachersData = {};
let subjectsData = {};
let slotsData = {};

// Initialize admin dashboard
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication and role
        const { user, userData } = await checkAuthState('admin');

        // Update UI with user info
        document.getElementById('userName').textContent = userData.name || 'Admin';
        document.getElementById('userAvatar').textContent = (userData.name || 'A').charAt(0).toUpperCase();

        // Setup navigation
        setupNavigation();

        // Setup forms
        setupForms();
        setupNoticeForm();

        // Load all data
        await loadAllData();
        await loadNotices();

        // Setup real-time listeners
        setupRealtimeListeners();
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

    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        classes: 'Class Management',
        rooms: 'Room Management',
        teachers: 'Teacher Management',
        subjects: 'Subject Management',
        slots: 'Time Slot Management',
        timetable: 'Timetable Generator',
        notices: 'Notice Board'
    };
    document.getElementById('pageTitle').textContent = titles[sectionName] || 'Dashboard';

    // Load dropdowns for subjects/timetable sections
    if (sectionName === 'subjects') {
        populateSubjectDropdowns();
    } else if (sectionName === 'timetable') {
        populateTimetableDropdown();
        loadExistingTimetables();
    }
}

// Form Setup
function setupForms() {
    // Class form
    document.getElementById('classForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addClass();
    });

    // Room form
    document.getElementById('roomForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addRoom();
    });

    // Teacher form
    document.getElementById('teacherForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addTeacher();
    });

    // Subject form
    document.getElementById('subjectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await addSubject();
    });
}

// Load all data
async function loadAllData() {
    await Promise.all([
        loadClasses(),
        loadRooms(),
        loadTeachers(),
        loadSubjects(),
        loadSlots()
    ]);
    updateDashboardStats();
}

// Real-time listeners
function setupRealtimeListeners() {
    console.log('Setting up real-time database listeners...');

    database.ref('classes').on('value', (snapshot) => {
        classesData = snapshot.val() || {};
        console.log('Classes data updated:', Object.keys(classesData).length, 'items');
        renderClassesTable();
        updateDashboardStats();
    }, (error) => {
        console.error('Error listening to classes:', error);
    });

    database.ref('rooms').on('value', (snapshot) => {
        roomsData = snapshot.val() || {};
        console.log('Rooms data updated:', Object.keys(roomsData).length, 'items');
        renderRoomsTable();
        updateDashboardStats();
    }, (error) => {
        console.error('Error listening to rooms:', error);
    });

    database.ref('teachers').on('value', (snapshot) => {
        teachersData = snapshot.val() || {};
        console.log('Teachers data updated:', Object.keys(teachersData).length, 'items');
        renderTeachersTable();
        updateDashboardStats();
    }, (error) => {
        console.error('Error listening to teachers:', error);
    });

    database.ref('subjects').on('value', (snapshot) => {
        subjectsData = snapshot.val() || {};
        console.log('Subjects data updated:', Object.keys(subjectsData).length, 'items');
        renderSubjectsTable();
        updateDashboardStats();
    }, (error) => {
        console.error('Error listening to subjects:', error);
    });

    database.ref('slots').on('value', (snapshot) => {
        slotsData = snapshot.val() || {};
        console.log('Slots data updated:', Object.keys(slotsData).length, 'items');
        renderSlotsTable();
    }, (error) => {
        console.error('Error listening to slots:', error);
    });

    console.log('Real-time listeners setup complete');
}

// Dashboard Stats
function updateDashboardStats() {
    document.getElementById('classCount').textContent = Object.keys(classesData).length;
    document.getElementById('roomCount').textContent = Object.keys(roomsData).length;
    document.getElementById('teacherCount').textContent = Object.keys(teachersData).length;
    document.getElementById('subjectCount').textContent = Object.keys(subjectsData).length;
}

// ==================== CLASS OPERATIONS ====================

async function loadClasses() {
    const snapshot = await database.ref('classes').once('value');
    classesData = snapshot.val() || {};
    renderClassesTable();
}

function renderClassesTable() {
    const tbody = document.getElementById('classesTableBody');
    const classes = Object.entries(classesData);

    if (classes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No classes added yet</td></tr>';
        return;
    }

    tbody.innerHTML = classes.map(([id, data]) => `
        <tr>
            <td><strong>${id}</strong></td>
            <td>${data.name}</td>
            <td>${data.dept}</td>
            <td class="actions">
                <button class="btn btn-sm btn-outline-primary btn-action" onclick="editClass('${id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteClass('${id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function addClass() {
    const classId = document.getElementById('classId').value.trim();
    const name = document.getElementById('className').value.trim();
    const dept = document.getElementById('classDept').value.trim();

    console.log('Attempting to add class:', { classId, name, dept });

    try {
        await database.ref(`classes/${classId}`).set({ name, dept });
        console.log('Class added successfully:', classId);
        showToast('Class added successfully!', 'success');
        document.getElementById('classForm').reset();
    } catch (error) {
        console.error('Error adding class:', { code: error.code, message: error.message, error });
        showToast('Error adding class: ' + error.message, 'danger');
    }
}

function editClass(classId) {
    const data = classesData[classId];
    const departments = [
        'Computer Science', 'Information Technology', 'Electronics', 'Electrical',
        'Mechanical', 'Civil', 'Chemical', 'Mathematics', 'Physics', 'Chemistry',
        'Humanities', 'Management'
    ];
    const deptOptions = departments.map(dept =>
        `<option value="${dept}" ${data.dept === dept ? 'selected' : ''}>${dept}</option>`
    ).join('');

    showEditModal('Edit Class', `
        <div class="mb-3">
            <label class="form-label">Class ID</label>
            <input type="text" class="form-control" id="editClassId" value="${classId}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">Class Name</label>
            <input type="text" class="form-control" id="editClassName" value="${data.name}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Department</label>
            <select class="form-select" id="editClassDept" required>
                <option value="">Select Department</option>
                ${deptOptions}
            </select>
        </div>
    `, async () => {
        const name = document.getElementById('editClassName').value.trim();
        const dept = document.getElementById('editClassDept').value;
        await database.ref(`classes/${classId}`).update({ name, dept });
        showToast('Class updated successfully!', 'success');
    });
}

async function deleteClass(classId) {
    if (confirm(`Are you sure you want to delete class "${classId}"?`)) {
        try {
            await database.ref(`classes/${classId}`).remove();
            showToast('Class deleted successfully!', 'success');
        } catch (error) {
            showToast('Error deleting class: ' + error.message, 'danger');
        }
    }
}

// ==================== ROOM OPERATIONS ====================

async function loadRooms() {
    const snapshot = await database.ref('rooms').once('value');
    roomsData = snapshot.val() || {};
    renderRoomsTable();
}

function renderRoomsTable() {
    const tbody = document.getElementById('roomsTableBody');
    const rooms = Object.entries(roomsData);

    if (rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No rooms added yet</td></tr>';
        return;
    }

    tbody.innerHTML = rooms.map(([id, data]) => {
        const typeLabel = data.type === 'lab' ? '<span class="badge bg-info">Lab</span>' : '<span class="badge bg-secondary">Classroom</span>';
        return `
            <tr>
                <td><strong>${id}</strong></td>
                <td>${data.name}</td>
                <td>${typeLabel}</td>
                <td>${data.capacity}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="editRoom('${id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteRoom('${id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function addRoom() {
    const roomId = document.getElementById('roomId').value.trim();
    const name = document.getElementById('roomName').value.trim();
    const roomType = document.getElementById('roomType').value;
    const capacity = parseInt(document.getElementById('roomCapacity').value);

    console.log('Attempting to add room:', { roomId, name, roomType, capacity });

    try {
        await database.ref(`rooms/${roomId}`).set({ name, type: roomType, capacity });
        console.log('Room added successfully:', roomId);
        showToast('Room added successfully!', 'success');
        document.getElementById('roomForm').reset();
    } catch (error) {
        console.error('Error adding room:', { code: error.code, message: error.message, error });
        showToast('Error adding room: ' + error.message, 'danger');
    }
}

function editRoom(roomId) {
    const data = roomsData[roomId];
    const roomType = data.type || 'classroom';
    showEditModal('Edit Room', `
        <div class="mb-3">
            <label class="form-label">Room ID</label>
            <input type="text" class="form-control" id="editRoomId" value="${roomId}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">Room Name</label>
            <input type="text" class="form-control" id="editRoomName" value="${data.name}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Room Type</label>
            <select class="form-select" id="editRoomType">
                <option value="classroom" ${roomType === 'classroom' ? 'selected' : ''}>Classroom</option>
                <option value="lab" ${roomType === 'lab' ? 'selected' : ''}>Laboratory</option>
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Capacity</label>
            <input type="number" class="form-control" id="editRoomCapacity" value="${data.capacity}" required>
        </div>
    `, async () => {
        const name = document.getElementById('editRoomName').value.trim();
        const type = document.getElementById('editRoomType').value;
        const capacity = parseInt(document.getElementById('editRoomCapacity').value);
        await database.ref(`rooms/${roomId}`).update({ name, type, capacity });
        showToast('Room updated successfully!', 'success');
    });
}

async function deleteRoom(roomId) {
    if (confirm(`Are you sure you want to delete room "${roomId}"?`)) {
        try {
            await database.ref(`rooms/${roomId}`).remove();
            showToast('Room deleted successfully!', 'success');
        } catch (error) {
            showToast('Error deleting room: ' + error.message, 'danger');
        }
    }
}

// ==================== TEACHER OPERATIONS ====================

async function loadTeachers() {
    const snapshot = await database.ref('teachers').once('value');
    teachersData = snapshot.val() || {};
    renderTeachersTable();
}

function renderTeachersTable() {
    const tbody = document.getElementById('teachersTableBody');
    const teachers = Object.entries(teachersData);

    if (teachers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No teachers added yet</td></tr>';
        return;
    }

    tbody.innerHTML = teachers.map(([id, data]) => `
        <tr>
            <td><strong>${id}</strong></td>
            <td>${data.name}</td>
            <td>${data.email}</td>
            <td>${data.dept}</td>
            <td class="actions">
                <button class="btn btn-sm btn-outline-primary btn-action" onclick="editTeacher('${id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteTeacher('${id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function addTeacher() {
    const teacherId = document.getElementById('teacherId').value.trim();
    const name = document.getElementById('teacherName').value.trim();
    const email = document.getElementById('teacherEmail').value.trim();
    const dept = document.getElementById('teacherDept').value.trim();

    console.log('Attempting to add teacher:', { teacherId, name, email, dept });

    try {
        await database.ref(`teachers/${teacherId}`).set({ name, email, dept });
        console.log('Teacher added successfully:', teacherId);
        showToast('Teacher added successfully!', 'success');
        document.getElementById('teacherForm').reset();
    } catch (error) {
        console.error('Error adding teacher:', { code: error.code, message: error.message, error });
        showToast('Error adding teacher: ' + error.message, 'danger');
    }
}

function editTeacher(teacherId) {
    const data = teachersData[teacherId];
    const departments = [
        'Computer Science', 'Information Technology', 'Electronics', 'Electrical',
        'Mechanical', 'Civil', 'Chemical', 'Mathematics', 'Physics', 'Chemistry',
        'Humanities', 'Management'
    ];
    const deptOptions = departments.map(dept =>
        `<option value="${dept}" ${data.dept === dept ? 'selected' : ''}>${dept}</option>`
    ).join('');

    showEditModal('Edit Teacher', `
        <div class="mb-3">
            <label class="form-label">Teacher ID</label>
            <input type="text" class="form-control" id="editTeacherId" value="${teacherId}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">Name</label>
            <input type="text" class="form-control" id="editTeacherName" value="${data.name}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Email</label>
            <input type="email" class="form-control" id="editTeacherEmail" value="${data.email}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Department</label>
            <select class="form-select" id="editTeacherDept" required>
                <option value="">Select Department</option>
                ${deptOptions}
            </select>
        </div>
    `, async () => {
        const name = document.getElementById('editTeacherName').value.trim();
        const email = document.getElementById('editTeacherEmail').value.trim();
        const dept = document.getElementById('editTeacherDept').value;
        await database.ref(`teachers/${teacherId}`).update({ name, email, dept });
        showToast('Teacher updated successfully!', 'success');
    });
}

async function deleteTeacher(teacherId) {
    if (confirm(`Are you sure you want to delete teacher "${teacherId}"?`)) {
        try {
            await database.ref(`teachers/${teacherId}`).remove();
            showToast('Teacher deleted successfully!', 'success');
        } catch (error) {
            showToast('Error deleting teacher: ' + error.message, 'danger');
        }
    }
}

// ==================== SUBJECT OPERATIONS ====================

async function loadSubjects() {
    const snapshot = await database.ref('subjects').once('value');
    subjectsData = snapshot.val() || {};
    renderSubjectsTable();
}

function renderSubjectsTable() {
    const tbody = document.getElementById('subjectsTableBody');
    const subjects = Object.entries(subjectsData);

    if (subjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No subjects added yet</td></tr>';
        return;
    }

    tbody.innerHTML = subjects.map(([id, data]) => {
        const className = classesData[data.classId]?.name || data.classId;
        const teacherName = teachersData[data.teacherId]?.name || data.teacherId;
        const subjectType = data.type || 'theory';
        const typeLabel = subjectType === 'practical'
            ? `<span class="badge bg-success">Practical</span>`
            : `<span class="badge bg-primary">Theory</span>`;
        const sessions = subjectType === 'practical'
            ? `${data.lecturesPerWeek} (${data.practicalDuration || 2}h each)`
            : data.lecturesPerWeek;
        return `
            <tr>
                <td><strong>${id}</strong></td>
                <td>${data.name}</td>
                <td>${typeLabel}</td>
                <td>${className}</td>
                <td>${teacherName}</td>
                <td>${sessions}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="editSubject('${id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteSubject('${id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function populateSubjectDropdowns() {
    // Populate class dropdown
    const classSelect = document.getElementById('subjectClass');
    classSelect.innerHTML = '<option value="">Select Class</option>';
    Object.entries(classesData).forEach(([id, data]) => {
        classSelect.innerHTML += `<option value="${id}">${data.name} (${id})</option>`;
    });

    // Populate teacher dropdown
    const teacherSelect = document.getElementById('subjectTeacher');
    teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
    Object.entries(teachersData).forEach(([id, data]) => {
        teacherSelect.innerHTML += `<option value="${id}">${data.name} (${id})</option>`;
    });

    // Populate lab room dropdown (only labs)
    const labSelect = document.getElementById('labRoom');
    if (labSelect) {
        labSelect.innerHTML = '<option value="">Select Lab</option>';
        Object.entries(roomsData).forEach(([id, data]) => {
            if (data.type === 'lab') {
                labSelect.innerHTML += `<option value="${id}">${data.name} (${id})</option>`;
            }
        });
    }
}

// Toggle practical fields visibility
function togglePracticalFields() {
    const subjectType = document.getElementById('subjectType').value;
    const practicalFields = document.getElementById('practicalFields');
    if (practicalFields) {
        practicalFields.style.display = subjectType === 'practical' ? 'flex' : 'none';
    }
}

async function addSubject() {
    const subjectId = document.getElementById('subjectId').value.trim();
    const name = document.getElementById('subjectName').value.trim();
    const subjectType = document.getElementById('subjectType').value;
    const classId = document.getElementById('subjectClass').value;
    const teacherId = document.getElementById('subjectTeacher').value;
    const lecturesPerWeek = parseInt(document.getElementById('lecturesPerWeek').value);

    const subjectData = {
        name,
        type: subjectType,
        classId,
        teacherId,
        lecturesPerWeek
    };

    // Add practical-specific fields
    if (subjectType === 'practical') {
        subjectData.labRoomId = document.getElementById('labRoom').value || null;
        subjectData.practicalDuration = parseInt(document.getElementById('practicalDuration').value) || 2;
    }

    console.log('Attempting to add subject:', subjectData);

    try {
        await database.ref(`subjects/${subjectId}`).set(subjectData);
        console.log('Subject added successfully:', subjectId);
        showToast('Subject added successfully!', 'success');
        document.getElementById('subjectForm').reset();
        document.getElementById('practicalFields').style.display = 'none';
    } catch (error) {
        console.error('Error adding subject:', { code: error.code, message: error.message, error });
        showToast('Error adding subject: ' + error.message, 'danger');
    }
}

function editSubject(subjectId) {
    const data = subjectsData[subjectId];
    const subjectType = data.type || 'theory';

    // Build class options
    const classOptions = Object.entries(classesData).map(([id, cls]) =>
        `<option value="${id}" ${id === data.classId ? 'selected' : ''}>${cls.name} (${id})</option>`
    ).join('');

    // Build teacher options
    const teacherOptions = Object.entries(teachersData).map(([id, teacher]) =>
        `<option value="${id}" ${id === data.teacherId ? 'selected' : ''}>${teacher.name} (${id})</option>`
    ).join('');

    // Build lab room options
    const labOptions = Object.entries(roomsData)
        .filter(([_, room]) => room.type === 'lab')
        .map(([id, room]) =>
            `<option value="${id}" ${id === data.labRoomId ? 'selected' : ''}>${room.name} (${id})</option>`
        ).join('');

    const practicalDuration = data.practicalDuration || 2;

    showEditModal('Edit Subject', `
        <div class="mb-3">
            <label class="form-label">Subject ID</label>
            <input type="text" class="form-control" id="editSubjectId" value="${subjectId}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">Subject Name</label>
            <input type="text" class="form-control" id="editSubjectName" value="${data.name}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Subject Type</label>
            <select class="form-select" id="editSubjectType" onchange="toggleEditPracticalFields()">
                <option value="theory" ${subjectType === 'theory' ? 'selected' : ''}>Theory</option>
                <option value="practical" ${subjectType === 'practical' ? 'selected' : ''}>Practical/Lab</option>
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Class</label>
            <select class="form-select" id="editSubjectClass" required>
                <option value="">Select Class</option>
                ${classOptions}
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Teacher</label>
            <select class="form-select" id="editSubjectTeacher" required>
                <option value="">Select Teacher</option>
                ${teacherOptions}
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Sessions Per Week</label>
            <input type="number" class="form-control" id="editLecturesPerWeek" value="${data.lecturesPerWeek}" min="1" max="10" required>
        </div>
        <div id="editPracticalFields" style="display: ${subjectType === 'practical' ? 'block' : 'none'};">
            <div class="mb-3">
                <label class="form-label">Lab Room</label>
                <select class="form-select" id="editLabRoom">
                    <option value="">Select Lab</option>
                    ${labOptions}
                </select>
            </div>
            <div class="mb-3">
                <label class="form-label">Duration (Periods)</label>
                <select class="form-select" id="editPracticalDuration">
                    <option value="2" ${practicalDuration === 2 ? 'selected' : ''}>2 Periods (2 hours)</option>
                    <option value="3" ${practicalDuration === 3 ? 'selected' : ''}>3 Periods (3 hours)</option>
                </select>
            </div>
        </div>
    `, async () => {
        const name = document.getElementById('editSubjectName').value.trim();
        const type = document.getElementById('editSubjectType').value;
        const classId = document.getElementById('editSubjectClass').value;
        const teacherId = document.getElementById('editSubjectTeacher').value;
        const lecturesPerWeek = parseInt(document.getElementById('editLecturesPerWeek').value);

        const updateData = { name, type, classId, teacherId, lecturesPerWeek };

        if (type === 'practical') {
            updateData.labRoomId = document.getElementById('editLabRoom').value || null;
            updateData.practicalDuration = parseInt(document.getElementById('editPracticalDuration').value) || 2;
        } else {
            // Clear practical fields if changed to theory
            updateData.labRoomId = null;
            updateData.practicalDuration = null;
        }

        await database.ref(`subjects/${subjectId}`).update(updateData);
        showToast('Subject updated successfully!', 'success');
    });
}

// Toggle practical fields in edit modal
function toggleEditPracticalFields() {
    const subjectType = document.getElementById('editSubjectType').value;
    const practicalFields = document.getElementById('editPracticalFields');
    if (practicalFields) {
        practicalFields.style.display = subjectType === 'practical' ? 'block' : 'none';
    }
}

async function deleteSubject(subjectId) {
    if (confirm(`Are you sure you want to delete subject "${subjectId}"?`)) {
        try {
            await database.ref(`subjects/${subjectId}`).remove();
            showToast('Subject deleted successfully!', 'success');
        } catch (error) {
            showToast('Error deleting subject: ' + error.message, 'danger');
        }
    }
}

// ==================== SLOT OPERATIONS ====================

async function loadSlots() {
    const snapshot = await database.ref('slots').once('value');
    slotsData = snapshot.val() || {};
    renderSlotsTable();
}

function renderSlotsTable() {
    const tbody = document.getElementById('slotsTableBody');
    const slots = Object.entries(slotsData);

    if (slots.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No time slots created yet</td></tr>';
        return;
    }

    // Sort slots by day and period order
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const periodOrder = [1, 2, 3, 'B1', 4, 5, 6, 'B2', 7, 8];
    slots.sort((a, b) => {
        const dayDiff = dayOrder.indexOf(a[1].day) - dayOrder.indexOf(b[1].day);
        if (dayDiff !== 0) return dayDiff;
        return periodOrder.indexOf(a[1].period) - periodOrder.indexOf(b[1].period);
    });

    tbody.innerHTML = slots.map(([id, data]) => {
        const isBreak = data.type === 'break';
        const periodLabel = isBreak ? data.label || 'Break' : `Period ${data.period}`;
        const rowClass = isBreak ? 'table-warning' : '';
        return `
            <tr class="${rowClass}">
                <td><strong>${id}</strong></td>
                <td>${data.day}</td>
                <td>${periodLabel}</td>
                <td>${data.start}</td>
                <td>${data.end}</td>
                <td><span class="badge bg-${isBreak ? 'warning text-dark' : 'primary'}">${data.type || 'class'}</span></td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteSlot('${id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function generateDefaultSlots() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    // 9am to 5pm schedule with breaks
    // Morning: P1, P2, P3 (9:00-12:00), then 30 min break
    // Afternoon: P4, P5, P6 (12:30-3:30), then 30 min break
    // Evening: P7, P8 (4:00-6:00)
    const periods = [
        { period: 1, start: '09:00', end: '10:00', type: 'class' },
        { period: 2, start: '10:00', end: '11:00', type: 'class' },
        { period: 3, start: '11:00', end: '12:00', type: 'class' },
        { period: 'B1', start: '12:00', end: '12:30', type: 'break', label: 'Short Break' },
        { period: 4, start: '12:30', end: '13:30', type: 'class' },
        { period: 5, start: '13:30', end: '14:30', type: 'class' },
        { period: 6, start: '14:30', end: '15:30', type: 'class' },
        { period: 'B2', start: '15:30', end: '16:00', type: 'break', label: 'Short Break' },
        { period: 7, start: '16:00', end: '17:00', type: 'class' }
    ];

    console.log('Generating default time slots (9am-5pm with breaks)...');

    try {
        const updates = {};
        days.forEach(day => {
            periods.forEach(p => {
                const slotId = `${day.substring(0, 3)}-P${p.period}`;
                updates[`slots/${slotId}`] = {
                    day,
                    period: p.period,
                    start: p.start,
                    end: p.end,
                    type: p.type,
                    label: p.label || null
                };
            });
        });

        console.log('Slots to create:', Object.keys(updates).length);
        await database.ref().update(updates);
        console.log('Default slots created successfully');
        showToast(`${Object.keys(updates).length} time slots created (including breaks)!`, 'success');
    } catch (error) {
        console.error('Error creating slots:', { code: error.code, message: error.message, error });
        showToast('Error creating slots: ' + error.message, 'danger');
    }
}

async function clearAllSlots() {
    if (confirm('Are you sure you want to delete all time slots? This will also affect existing timetables.')) {
        try {
            await database.ref('slots').remove();
            showToast('All time slots deleted!', 'success');
        } catch (error) {
            showToast('Error clearing slots: ' + error.message, 'danger');
        }
    }
}

async function deleteSlot(slotId) {
    if (confirm(`Are you sure you want to delete slot "${slotId}"?`)) {
        try {
            await database.ref(`slots/${slotId}`).remove();
            showToast('Slot deleted successfully!', 'success');
        } catch (error) {
            showToast('Error deleting slot: ' + error.message, 'danger');
        }
    }
}

// ==================== TIMETABLE OPERATIONS ====================

function populateTimetableDropdown() {
    const select = document.getElementById('timetableClass');
    select.innerHTML = '<option value="">All Classes</option>';
    Object.entries(classesData).forEach(([id, data]) => {
        select.innerHTML += `<option value="${id}">${data.name} (${id})</option>`;
    });
}

// Load and display existing timetables
async function loadExistingTimetables() {
    const container = document.getElementById('timetableContainer');
    const select = document.getElementById('timetableClass');

    try {
        // Fetch existing timetables
        const timetablesSnap = await database.ref('timetables').once('value');
        const timetables = timetablesSnap.val() || {};

        const timetableClasses = Object.keys(timetables);

        if (timetableClasses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-calendar-x"></i>
                    <h5>No Timetables Generated Yet</h5>
                    <p>Select a class and click "Generate Timetable" to create a schedule</p>
                </div>
            `;
            return;
        }

        // Show summary of existing timetables
        let summaryHtml = `
            <div class="alert alert-info mb-3">
                <i class="bi bi-info-circle"></i>
                <strong>${timetableClasses.length} timetable(s) found.</strong>
                Select a class below to view, or generate new timetables.
            </div>
            <div class="row g-3 mb-4">
        `;

        for (const classId of timetableClasses) {
            const classData = classesData[classId] || { name: classId };
            const entryCount = Object.keys(timetables[classId] || {}).length;

            summaryHtml += `
                <div class="col-md-4">
                    <div class="card h-100 timetable-summary-card" style="cursor: pointer;" onclick="viewClassTimetable('${classId}')">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="bi bi-calendar-week text-primary"></i>
                                ${classData.name}
                            </h6>
                            <p class="card-text text-muted mb-0">
                                <small>${entryCount} scheduled slots</small>
                            </p>
                        </div>
                        <div class="card-footer bg-transparent">
                            <button class="btn btn-sm btn-outline-primary w-100">
                                <i class="bi bi-eye"></i> View Timetable
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        summaryHtml += '</div>';

        // Check if a class is already selected
        const selectedClass = select.value;
        if (selectedClass && timetables[selectedClass]) {
            // Display the selected class's timetable
            await displayTimetable(selectedClass);
        } else {
            // Show the summary
            container.innerHTML = summaryHtml;
        }

    } catch (error) {
        console.error('Error loading existing timetables:', error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error loading timetables: ${error.message}
            </div>
        `;
    }
}

// View a specific class's timetable
async function viewClassTimetable(classId) {
    const select = document.getElementById('timetableClass');
    select.value = classId;
    await displayTimetable(classId);
}

async function clearTimetable() {
    const selectedClass = document.getElementById('timetableClass').value;

    if (selectedClass) {
        if (confirm(`Are you sure you want to clear the timetable for "${selectedClass}"?`)) {
            try {
                await database.ref(`timetables/${selectedClass}`).remove();
                showToast('Timetable cleared!', 'success');
                document.getElementById('timetableContainer').innerHTML = `
                    <div class="empty-state">
                        <i class="bi bi-calendar-x"></i>
                        <h5>No Timetable Generated</h5>
                        <p>Click "Generate Timetable" to create a schedule</p>
                    </div>
                `;
            } catch (error) {
                showToast('Error clearing timetable: ' + error.message, 'danger');
            }
        }
    } else {
        if (confirm('Are you sure you want to clear ALL timetables?')) {
            try {
                await database.ref('timetables').remove();
                showToast('All timetables cleared!', 'success');
                document.getElementById('timetableContainer').innerHTML = `
                    <div class="empty-state">
                        <i class="bi bi-calendar-x"></i>
                        <h5>No Timetable Generated</h5>
                        <p>Click "Generate Timetable" to create a schedule</p>
                    </div>
                `;
            } catch (error) {
                showToast('Error clearing timetables: ' + error.message, 'danger');
            }
        }
    }
}

// ==================== NOTICE OPERATIONS ====================

let noticesData = {};
let currentUserInfo = null;

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
    const notices = Object.entries(noticesData).sort((a, b) =>
        new Date(b[1].createdAt) - new Date(a[1].createdAt)
    );

    if (notices.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="bi bi-megaphone"></i>
                <h5>No Notices Yet</h5>
                <p>Create a notice to share with students and faculty</p>
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
                    <div class="notice-actions">
                        <button class="btn btn-sm btn-outline-primary me-1" onclick="editNotice('${id}')">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteNotice('${id}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
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
        authorRole: 'admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    console.log('Creating notice:', noticeData);

    try {
        await database.ref(`notices/${noticeId}`).set(noticeData);
        console.log('Notice created successfully:', noticeId);
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
                <option value="faculty" ${data.audience === 'faculty' ? 'selected' : ''}>Faculty Only</option>
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
    }, (error) => {
        console.error('Error listening to notices:', error);
    });
}

// ==================== UTILITY FUNCTIONS ====================

function showEditModal(title, bodyContent, onSave) {
    document.getElementById('editModalTitle').textContent = title;
    document.getElementById('editModalBody').innerHTML = bodyContent;

    const saveBtn = document.getElementById('saveEditBtn');
    const modal = new bootstrap.Modal(document.getElementById('editModal'));

    // Remove old listener and add new one
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
    const toastId = 'toast-' + Date.now();

    const toast = document.createElement('div');
    toast.className = `toast show`;
    toast.id = toastId;
    toast.innerHTML = `
        <div class="toast-header bg-${type} text-white">
            <i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-circle'} me-2"></i>
            <strong class="me-auto">${type === 'success' ? 'Success' : 'Error'}</strong>
            <button type="button" class="btn-close btn-close-white" onclick="this.closest('.toast').remove()"></button>
        </div>
        <div class="toast-body">${message}</div>
    `;

    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.remove();
    }, 4000);
}
