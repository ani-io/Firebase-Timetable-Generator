// Admin Dashboard Logic

// Data cache
let batchesData = {};
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
        setupBatchForm();
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
        batches: 'Batch Management',
        classes: 'Class Management',
        rooms: 'Room Management',
        teachers: 'Teacher Management',
        subjects: 'Subject Management',
        slots: 'Time Slot Management',
        timetable: 'Timetable Generator',
        notices: 'Notice Board',
        reports: 'Progress Reports',
        lectureRecords: 'Lecture Records',
        aiSettings: 'AI Settings'
    };
    document.getElementById('pageTitle').textContent = titles[sectionName] || 'Dashboard';

    // Load dropdowns for various sections
    if (sectionName === 'classes') {
        populateClassBatchDropdown();
    } else if (sectionName === 'subjects') {
        populateSubjectDropdowns();
        autoGenerateSubjectId();
    } else if (sectionName === 'timetable') {
        populateTimetableDropdown();
        loadExistingTimetables();
    } else if (sectionName === 'reports') {
        populateReportFilters();
        loadReports();
    } else if (sectionName === 'lectureRecords') {
        populateRecordsFilters();
        loadLectureRecords(); // Auto-load all records
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
        loadBatches(),
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

    database.ref('batches').on('value', (snapshot) => {
        batchesData = snapshot.val() || {};
        console.log('Batches data updated:', Object.keys(batchesData).length, 'items');
        renderBatchesTable();
    }, (error) => {
        console.error('Error listening to batches:', error);
    });

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

// ==================== BATCH OPERATIONS ====================

// Setup batch form
function setupBatchForm() {
    const form = document.getElementById('batchForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addBatch();
        });
    }

    // Auto-generate batch name when fields change
    const yearSelect = document.getElementById('batchAcademicYear');
    const branchInput = document.getElementById('batchBranch');
    const semesterSelect = document.getElementById('batchSemester');
    const nameInput = document.getElementById('batchName');

    const updateBatchName = () => {
        const year = yearSelect.value;
        const branch = branchInput.value.trim();
        const semester = semesterSelect.value;

        if (year && branch && semester) {
            // Generate short name: FY-CE-SEM8
            const yearShort = year.split(' ').map(w => w[0]).join('');
            const branchShort = branch.split(' ').map(w => w[0]).join('').toUpperCase();
            nameInput.value = `${yearShort}-${branchShort}-SEM${semester}`;
        } else {
            nameInput.value = '';
        }
    };

    if (yearSelect) yearSelect.addEventListener('change', updateBatchName);
    if (branchInput) branchInput.addEventListener('input', updateBatchName);
    if (semesterSelect) semesterSelect.addEventListener('change', updateBatchName);
}

async function loadBatches() {
    const snapshot = await database.ref('batches').once('value');
    batchesData = snapshot.val() || {};
    renderBatchesTable();
}

function renderBatchesTable() {
    const tbody = document.getElementById('batchesTableBody');
    if (!tbody) return;

    const batches = Object.entries(batchesData);

    if (batches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No batches added yet</td></tr>';
        return;
    }

    tbody.innerHTML = batches.map(([id, data]) => `
        <tr>
            <td><strong>${id}</strong></td>
            <td>${data.name}</td>
            <td>${data.academicYear}</td>
            <td>${data.branch}</td>
            <td>Semester ${data.semester}</td>
            <td class="actions">
                <button class="btn btn-sm btn-outline-primary btn-action" onclick="editBatch('${id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteBatch('${id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function addBatch() {
    const academicYear = document.getElementById('batchAcademicYear').value;
    const branch = document.getElementById('batchBranch').value.trim();
    const semester = document.getElementById('batchSemester').value;
    const name = document.getElementById('batchName').value.trim();

    // Generate batch ID
    const batchId = 'BATCH-' + Date.now();

    const batchData = {
        academicYear,
        branch,
        semester,
        name,
        createdAt: new Date().toISOString(),
        createdBy: auth.currentUser.uid
    };

    console.log('Attempting to add batch:', batchData);

    try {
        await database.ref(`batches/${batchId}`).set(batchData);
        console.log('Batch added successfully:', batchId);
        showToast('Batch added successfully!', 'success');
        document.getElementById('batchForm').reset();
        document.getElementById('batchName').value = '';
    } catch (error) {
        console.error('Error adding batch:', error);
        showToast('Error adding batch: ' + error.message, 'danger');
    }
}

function editBatch(batchId) {
    const data = batchesData[batchId];

    const yearOptions = ['First Year', 'Second Year', 'Third Year', 'Final Year'].map(year =>
        `<option value="${year}" ${data.academicYear === year ? 'selected' : ''}>${year}</option>`
    ).join('');

    const semesterOptions = [1, 2, 3, 4, 5, 6, 7, 8].map(sem =>
        `<option value="${sem}" ${data.semester == sem ? 'selected' : ''}>Semester ${sem}</option>`
    ).join('');

    showEditModal('Edit Batch', `
        <div class="mb-3">
            <label class="form-label">Batch ID</label>
            <input type="text" class="form-control" id="editBatchId" value="${batchId}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">Academic Year</label>
            <select class="form-select" id="editBatchAcademicYear" required>
                <option value="">Select Year</option>
                ${yearOptions}
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Branch</label>
            <input type="text" class="form-control" id="editBatchBranch" value="${data.branch}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Semester</label>
            <select class="form-select" id="editBatchSemester" required>
                <option value="">Select Semester</option>
                ${semesterOptions}
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Batch Name</label>
            <input type="text" class="form-control" id="editBatchName" value="${data.name}" required>
        </div>
    `, async () => {
        const academicYear = document.getElementById('editBatchAcademicYear').value;
        const branch = document.getElementById('editBatchBranch').value.trim();
        const semester = document.getElementById('editBatchSemester').value;
        const name = document.getElementById('editBatchName').value.trim();

        await database.ref(`batches/${batchId}`).update({
            academicYear, branch, semester, name
        });
        showToast('Batch updated successfully!', 'success');
    });
}

async function deleteBatch(batchId) {
    if (confirm(`Are you sure you want to delete batch "${batchId}"? This will not delete associated classes.`)) {
        try {
            await database.ref(`batches/${batchId}`).remove();
            showToast('Batch deleted successfully!', 'success');
        } catch (error) {
            showToast('Error deleting batch: ' + error.message, 'danger');
        }
    }
}

// Populate batch dropdown in class form
function populateClassBatchDropdown() {
    const select = document.getElementById('classBatch');
    if (!select) return;

    select.innerHTML = '<option value="">Select Batch (Optional)</option>';
    Object.entries(batchesData).forEach(([id, data]) => {
        select.innerHTML += `<option value="${id}">${data.name} (${data.academicYear})</option>`;
    });
}

// ==================== CLASS OPERATIONS ====================

// Update batch preview when count or prefix changes
function updateBatchPreview() {
    const count = parseInt(document.getElementById('classBatchCount')?.value) || 4;
    const prefix = document.getElementById('classBatchPrefix')?.value || 'A';
    const preview = document.getElementById('batchPreview');

    if (!preview) return;

    // Clear existing content
    preview.textContent = '';

    if (count <= 1) {
        const span = document.createElement('span');
        span.className = 'text-muted';
        span.textContent = 'No lab batches';
        preview.appendChild(span);
        return;
    }

    for (let i = 1; i <= count; i++) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-primary me-1';
        badge.textContent = `${prefix}${i}`;
        preview.appendChild(badge);
    }
}

// Generate batch names array
function generateBatchNames(count, prefix) {
    if (count <= 1) return [];
    const batches = [];
    for (let i = 1; i <= count; i++) {
        batches.push(`${prefix}${i}`);
    }
    return batches;
}

async function loadClasses() {
    const snapshot = await database.ref('classes').once('value');
    classesData = snapshot.val() || {};
    renderClassesTable();
}

function renderClassesTable() {
    const tbody = document.getElementById('classesTableBody');
    const classes = Object.entries(classesData);

    if (classes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No classes added yet</td></tr>';
        return;
    }

    tbody.innerHTML = classes.map(([id, data]) => {
        const batchName = data.batchId && batchesData[data.batchId]
            ? batchesData[data.batchId].name
            : '<span class="text-muted">-</span>';

        // Lab batches display
        let labBatchesHtml = '<span class="text-muted">None</span>';
        if (data.labBatches && data.labBatches.length > 0) {
            labBatchesHtml = data.labBatches.map(b =>
                `<span class="badge bg-info me-1">${escapeHtml(b)}</span>`
            ).join('');
        } else if (data.labBatchCount > 1) {
            // Fallback: generate from count and prefix
            const batches = generateBatchNames(data.labBatchCount, data.labBatchPrefix || 'A');
            labBatchesHtml = batches.map(b =>
                `<span class="badge bg-info me-1">${escapeHtml(b)}</span>`
            ).join('');
        }

        return `
            <tr>
                <td><strong>${escapeHtml(id)}</strong></td>
                <td>${escapeHtml(data.name)}</td>
                <td>${batchName}</td>
                <td>${escapeHtml(data.dept)}</td>
                <td>${labBatchesHtml}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="editClass('${escapeHtml(id)}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteClass('${escapeHtml(id)}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

async function addClass() {
    const classId = document.getElementById('classId').value.trim();
    const name = document.getElementById('className').value.trim();
    const dept = document.getElementById('classDept').value.trim();
    const batchId = document.getElementById('classBatch').value || null;

    // Lab batch configuration
    const labBatchCount = parseInt(document.getElementById('classBatchCount').value) || 1;
    const labBatchPrefix = document.getElementById('classBatchPrefix').value.trim() || 'A';
    const studentsPerBatch = parseInt(document.getElementById('classStudentsPerBatch').value) || 15;
    const labBatches = generateBatchNames(labBatchCount, labBatchPrefix);

    console.log('Attempting to add class:', { classId, name, dept, batchId, labBatchCount, labBatches });

    const classData = {
        name,
        dept,
        labBatchCount,
        labBatchPrefix,
        labBatches,
        studentsPerBatch
    };
    if (batchId) {
        classData.batchId = batchId;
    }

    try {
        await database.ref(`classes/${classId}`).set(classData);
        console.log('Class added successfully:', classId);
        showToast('Class added successfully!', 'success');
        document.getElementById('classForm').reset();
        // Reset batch preview
        updateBatchPreview();
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

    // Build batch options
    const batchOptions = Object.entries(batchesData).map(([id, batch]) =>
        `<option value="${id}" ${data.batchId === id ? 'selected' : ''}>${batch.name} (${batch.academicYear})</option>`
    ).join('');

    // Lab batch configuration
    const labBatchCount = data.labBatchCount || 1;
    const labBatchPrefix = data.labBatchPrefix || 'A';
    const studentsPerBatch = data.studentsPerBatch || 15;

    // Build batch count options
    const batchCountOptions = [1, 2, 3, 4, 5, 6].map(n =>
        `<option value="${n}" ${labBatchCount === n ? 'selected' : ''}>${n === 1 ? '1 (No batches)' : n + ' Batches'}</option>`
    ).join('');

    showEditModal('Edit Class', `
        <div class="mb-3">
            <label class="form-label">Class ID</label>
            <input type="text" class="form-control" id="editClassId" value="${escapeHtml(classId)}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">Academic Batch</label>
            <select class="form-select" id="editClassBatch">
                <option value="">No Batch</option>
                ${batchOptions}
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Class Name</label>
            <input type="text" class="form-control" id="editClassName" value="${escapeHtml(data.name)}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Department</label>
            <select class="form-select" id="editClassDept" required>
                <option value="">Select Department</option>
                ${deptOptions}
            </select>
        </div>
        <hr>
        <h6 class="text-muted mb-3"><i class="bi bi-collection"></i> Lab Batch Configuration</h6>
        <div class="row">
            <div class="col-md-4 mb-3">
                <label class="form-label">Lab Batch Count</label>
                <select class="form-select" id="editClassBatchCount" onchange="updateEditBatchPreview()">
                    ${batchCountOptions}
                </select>
            </div>
            <div class="col-md-4 mb-3">
                <label class="form-label">Batch Prefix</label>
                <input type="text" class="form-control" id="editClassBatchPrefix" value="${escapeHtml(labBatchPrefix)}" maxlength="2" onkeyup="updateEditBatchPreview()">
            </div>
            <div class="col-md-4 mb-3">
                <label class="form-label">Students/Batch</label>
                <input type="number" class="form-control" id="editClassStudentsPerBatch" value="${studentsPerBatch}" min="1" max="100">
            </div>
        </div>
        <div class="mb-3">
            <label class="form-label">Lab Batches Preview</label>
            <div id="editBatchPreview" class="form-control bg-light"></div>
        </div>
    `, async () => {
        const name = document.getElementById('editClassName').value.trim();
        const dept = document.getElementById('editClassDept').value;
        const batchId = document.getElementById('editClassBatch').value || null;
        const labBatchCount = parseInt(document.getElementById('editClassBatchCount').value) || 1;
        const labBatchPrefix = document.getElementById('editClassBatchPrefix').value.trim() || 'A';
        const studentsPerBatch = parseInt(document.getElementById('editClassStudentsPerBatch').value) || 15;
        const labBatches = generateBatchNames(labBatchCount, labBatchPrefix);

        await database.ref(`classes/${classId}`).update({
            name, dept, batchId, labBatchCount, labBatchPrefix, labBatches, studentsPerBatch
        });
        showToast('Class updated successfully!', 'success');
    });

    // Initialize batch preview after modal is shown
    setTimeout(() => updateEditBatchPreview(), 100);
}

// Update batch preview in edit modal
function updateEditBatchPreview() {
    const count = parseInt(document.getElementById('editClassBatchCount')?.value) || 1;
    const prefix = document.getElementById('editClassBatchPrefix')?.value || 'A';
    const preview = document.getElementById('editBatchPreview');

    if (!preview) return;

    preview.textContent = '';

    if (count <= 1) {
        const span = document.createElement('span');
        span.className = 'text-muted';
        span.textContent = 'No lab batches';
        preview.appendChild(span);
        return;
    }

    for (let i = 1; i <= count; i++) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-primary me-1';
        badge.textContent = `${prefix}${i}`;
        preview.appendChild(badge);
    }
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
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No teachers added yet</td></tr>';
        return;
    }

    tbody.innerHTML = teachers.map(([id, data]) => {
        const unavailableCount = (data.unavailableSlots || []).length;
        const availabilityBadge = unavailableCount > 0
            ? `<span class="badge bg-warning text-dark">${unavailableCount} blocked</span>`
            : '<span class="badge bg-success">Full</span>';

        return `
            <tr>
                <td><strong>${id}</strong></td>
                <td>${data.name}</td>
                <td>${data.email}</td>
                <td>${data.dept}</td>
                <td>${data.maxHoursPerWeek || 20} hrs</td>
                <td>
                    ${availabilityBadge}
                    <button class="btn btn-sm btn-outline-info ms-1" onclick="openAvailabilityModal('${id}')" title="Manage Availability">
                        <i class="bi bi-calendar-check"></i>
                    </button>
                </td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="editTeacher('${id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteTeacher('${id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function addTeacher() {
    const teacherId = document.getElementById('teacherId').value.trim();
    const name = document.getElementById('teacherName').value.trim();
    const email = document.getElementById('teacherEmail').value.trim();
    const dept = document.getElementById('teacherDept').value.trim();
    const maxHoursPerWeek = parseInt(document.getElementById('teacherMaxHours').value) || 20;

    console.log('Attempting to add teacher:', { teacherId, name, email, dept, maxHoursPerWeek });

    try {
        await database.ref(`teachers/${teacherId}`).set({
            name,
            email,
            dept,
            maxHoursPerWeek,
            unavailableSlots: []
        });
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
        <div class="mb-3">
            <label class="form-label">Max Hours Per Week</label>
            <input type="number" class="form-control" id="editTeacherMaxHours" value="${data.maxHoursPerWeek || 20}" min="1" max="40">
        </div>
    `, async () => {
        const name = document.getElementById('editTeacherName').value.trim();
        const email = document.getElementById('editTeacherEmail').value.trim();
        const dept = document.getElementById('editTeacherDept').value;
        const maxHoursPerWeek = parseInt(document.getElementById('editTeacherMaxHours').value) || 20;
        await database.ref(`teachers/${teacherId}`).update({ name, email, dept, maxHoursPerWeek });
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

    // Sort subjects by name, then by code
    subjects.sort((a, b) => {
        const nameA = (a[1].name || '').toLowerCase();
        const nameB = (b[1].name || '').toLowerCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB);

        const codeA = (a[1].code || a[0]).toLowerCase();
        const codeB = (b[1].code || b[0]).toLowerCase();
        if (codeA !== codeB) return codeA.localeCompare(codeB);

        // Third level: by class name if everything else matches
        const classA = (classesData[a[1].classId]?.name || '').toLowerCase();
        const classB = (classesData[b[1].classId]?.name || '').toLowerCase();
        return classA.localeCompare(classB);
    });

    if (subjects.length === 0) {
        document.getElementById('subjectSummaryRow').innerHTML = '';
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No subjects added yet</td></tr>';
        return;
    }

    // Update the summary row with counts per year prefix
    updateSubjectSummary(subjects);

    tbody.innerHTML = subjects.map(([id, data]) => {
        const className = classesData[data.classId]?.name || data.classId;
        const teacherName = teachersData[data.teacherId]?.name || data.teacherId;
        const subjectType = data.type || 'theory';

        // Type label with batch indicator
        let typeLabel;
        if (subjectType === 'practical') {
            if (data.isBatchBased) {
                typeLabel = `<span class="badge bg-success">Practical</span> <span class="badge bg-info">Batch</span>`;
            } else {
                typeLabel = `<span class="badge bg-success">Practical</span>`;
            }
        } else {
            typeLabel = `<span class="badge bg-primary">Theory</span>`;
        }

        const sessions = subjectType === 'practical'
            ? `${data.lecturesPerWeek} (${data.practicalDuration || 2}h each)`
            : data.lecturesPerWeek;

        // Progress calculation (completed will be calculated from lectureRecords)
        const totalLectures = data.totalLectures || 0;
        const completedLectures = data.completedLectures || 0;
        const progressPercent = totalLectures > 0 ? Math.round((completedLectures / totalLectures) * 100) : 0;
        const progressColor = progressPercent >= 75 ? 'success' : progressPercent >= 50 ? 'warning' : 'danger';

        return `
            <tr>
                <td><strong>${escapeHtml(data.code || id)}</strong></td>
                <td>${escapeHtml(data.name)}</td>
                <td>${typeLabel}</td>
                <td>${escapeHtml(className)}</td>
                <td>${escapeHtml(teacherName)}</td>
                <td>${sessions}</td>
                <td>
                    <div class="progress" style="height: 20px; min-width: 100px;">
                        <div class="progress-bar bg-${progressColor}" role="progressbar"
                             style="width: ${progressPercent}%;"
                             aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100">
                            ${completedLectures}/${totalLectures}
                        </div>
                    </div>
                </td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline-primary btn-action" onclick="editSubject('${escapeHtml(id)}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-action" onclick="deleteSubject('${escapeHtml(id)}')">
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
    if (classSelect) {
        classSelect.innerHTML = '<option value="">Select Class</option>';
        Object.entries(classesData)
            .sort((a, b) => (a[1].name || '').toLowerCase().localeCompare((b[1].name || '').toLowerCase()))
            .forEach(([id, data]) => {
                classSelect.innerHTML += `<option value="${id}">${data.name} (${id})</option>`;
            });
    }

    // Populate teacher dropdown
    const teacherSelect = document.getElementById('subjectTeacher');
    if (teacherSelect) {
        teacherSelect.innerHTML = '<option value="">Select Teacher</option>';
        Object.entries(teachersData)
            .sort((a, b) => (a[1].name || '').toLowerCase().localeCompare((b[1].name || '').toLowerCase()))
            .forEach(([id, data]) => {
                teacherSelect.innerHTML += `<option value="${id}">${data.name} (${id})</option>`;
            });
    }

    // Populate lab room dropdown (only labs)
    const labSelect = document.getElementById('labRoom');
    if (labSelect) {
        labSelect.innerHTML = '<option value="">Select Lab</option>';
        Object.entries(roomsData)
            .filter(([_, data]) => data.type === 'lab')
            .sort((a, b) => (a[1].name || '').toLowerCase().localeCompare((b[1].name || '').toLowerCase()))
            .forEach(([id, data]) => {
                labSelect.innerHTML += `<option value="${id}">${data.name} (${id})</option>`;
            });
    }
}

// Toggle practical fields visibility
function togglePracticalFields() {
    const subjectType = document.getElementById('subjectType').value;
    const practicalFields = document.getElementById('practicalFields');
    const singleLabFields = document.getElementById('singleLabFields');
    const batchBasedFields = document.getElementById('batchBasedFields');
    const isBatchBasedCheckbox = document.getElementById('isBatchBased');

    if (practicalFields) {
        practicalFields.style.display = subjectType === 'practical' ? 'flex' : 'none';
    }

    // Reset batch-based when switching away from practical
    if (subjectType !== 'practical') {
        if (singleLabFields) singleLabFields.style.display = 'none';
        if (batchBasedFields) batchBasedFields.style.display = 'none';
        if (isBatchBasedCheckbox) isBatchBasedCheckbox.checked = false;
    } else {
        // Show single lab fields by default
        toggleBatchBasedFields();
    }
}

// Toggle batch-based practical fields
function toggleBatchBasedFields() {
    const isBatchBased = document.getElementById('isBatchBased')?.checked || false;
    const singleLabFields = document.getElementById('singleLabFields');
    const batchBasedFields = document.getElementById('batchBasedFields');

    if (singleLabFields) {
        singleLabFields.style.display = isBatchBased ? 'none' : 'flex';
    }

    if (batchBasedFields) {
        batchBasedFields.style.display = isBatchBased ? 'block' : 'none';
        if (isBatchBased) {
            populateBatchAssignments();
        }
    }
}

// Populate batch assignment rows based on selected class
function populateBatchAssignments() {
    const classId = document.getElementById('subjectClass').value;
    const container = document.getElementById('batchAssignmentsContainer');

    if (!container) return;

    if (!classId) {
        container.textContent = '';
        const msg = document.createElement('p');
        msg.className = 'text-muted';
        msg.textContent = 'Select a class first to see available batches.';
        container.appendChild(msg);
        return;
    }

    const classData = classesData[classId];
    const batches = classData?.labBatches || [];

    if (batches.length === 0) {
        container.textContent = '';
        const alert = document.createElement('div');
        alert.className = 'alert alert-warning';
        alert.textContent = 'This class has no lab batches configured. Go to Classes section to add batches.';
        container.appendChild(alert);
        return;
    }

    // Build teacher options
    const teacherOptions = Object.entries(teachersData)
        .sort((a, b) => (a[1].name || '').toLowerCase().localeCompare((b[1].name || '').toLowerCase()))
        .map(([id, data]) =>
            `<option value="${escapeHtml(id)}">${escapeHtml(data.name)}</option>`
        ).join('');

    // Build lab options
    const labOptions = Object.entries(roomsData)
        .filter(([_, room]) => room.type === 'lab')
        .sort((a, b) => (a[1].name || '').toLowerCase().localeCompare((b[1].name || '').toLowerCase()))
        .map(([id, data]) =>
            `<option value="${escapeHtml(id)}">${escapeHtml(data.name)}</option>`
        ).join('');

    // Clear container
    container.textContent = '';

    // Create rows for each batch
    const table = document.createElement('table');
    table.className = 'table table-sm table-bordered';

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr class="table-light">
            <th style="width: 100px;">Batch</th>
            <th>Teacher</th>
            <th>Lab Room</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    batches.forEach(batch => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="badge bg-primary">${escapeHtml(batch)}</span></td>
            <td>
                <select class="form-select form-select-sm" id="batchTeacher_${escapeHtml(batch)}" required>
                    <option value="">Select Teacher</option>
                    ${teacherOptions}
                </select>
            </td>
            <td>
                <select class="form-select form-select-sm" id="batchLab_${escapeHtml(batch)}" required>
                    <option value="">Select Lab</option>
                    ${labOptions}
                </select>
            </td>
        `;
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
}

// Update subject summary row with counts per year prefix
function updateSubjectSummary(subjects) {
    const summaryRow = document.getElementById('subjectSummaryRow');
    if (!summaryRow) return;

    const counts = { FY: 0, SY: 0, TE: 0, BE: 0 };
    
    subjects.forEach(([id, data]) => {
        const code = (data.code || '').toUpperCase();
        if (code.startsWith('FY')) counts.FY++;
        else if (code.startsWith('SY')) counts.SY++;
        else if (code.startsWith('TE')) counts.TE++;
        else if (code.startsWith('BE')) counts.BE++;
    });

    summaryRow.innerHTML = `
        <span class="badge bg-primary px-3 py-2">FY: ${counts.FY}</span>
        <span class="badge bg-success px-3 py-2">SY: ${counts.SY}</span>
        <span class="badge bg-warning text-dark px-3 py-2">TE: ${counts.TE}</span>
        <span class="badge bg-danger px-3 py-2">BE: ${counts.BE}</span>
        <span class="badge bg-secondary px-3 py-2">Total: ${subjects.length}</span>
    `;
}

// Function to generate a unique Subject ID
function autoGenerateSubjectId() {
    const input = document.getElementById('subjectId');
    if (!input) return;

    // Find the next available SY/SUB number
    const existingIds = Object.keys(subjectsData);
    let maxNum = 0;
    
    existingIds.forEach(id => {
        // Try to find numbers in IDs like SY18 or SUB33
        const match = id.match(/\d+/);
        if (match) {
            const num = parseInt(match[0]);
            if (num > maxNum) maxNum = num;
        }
    });

    const nextNum = maxNum + 1;
    input.value = `SUB${nextNum.toString().padStart(3, '0')}`;
}

// Listen for class selection changes to update batch assignments
document.addEventListener('DOMContentLoaded', () => {
    const classSelect = document.getElementById('subjectClass');
    if (classSelect) {
        classSelect.addEventListener('change', () => {
            const isBatchBased = document.getElementById('isBatchBased')?.checked;
            if (isBatchBased) {
                populateBatchAssignments();
            }
        });
    }
});

async function addSubject() {
    const subjectId = document.getElementById('subjectId').value.trim();
    
    // Check if ID already exists to prevent accidental overwrite
    if (subjectsData[subjectId]) {
        const confirmOverwrite = confirm(`Subject ID "${subjectId}" already exists. Adding this will REPLACE the existing subject. Do you want to continue?`);
        if (!confirmOverwrite) return;
    }

    const code = document.getElementById('subjectCode').value.trim();
    const name = document.getElementById('subjectName').value.trim();
    const subjectType = document.getElementById('subjectType').value;
    const classId = document.getElementById('subjectClass').value;
    const teacherId = document.getElementById('subjectTeacher').value;
    const lecturesPerWeek = parseInt(document.getElementById('lecturesPerWeek').value);
    const totalLectures = parseInt(document.getElementById('totalLectures').value);

    // Validation
    const upperCode = code.toUpperCase();
    const validPrefixes = ['FY', 'SY', 'TE', 'BE'];
    const hasValidPrefix = validPrefixes.some(prefix => upperCode.startsWith(prefix));

    if (!subjectId) { showToast('Subject ID is required', 'warning'); return; }
    if (!code) { showToast('Subject Code is required', 'warning'); return; }
    if (!hasValidPrefix) { 
        showToast('Invalid Subject Code! Must start with FY, SY, TE, or BE (e.g., SY101)', 'danger'); 
        return; 
    }
    if (!name) { showToast('Subject Name is required', 'warning'); return; }
    if (!classId) { showToast('Please select a Class', 'warning'); return; }
    
    if (isNaN(lecturesPerWeek) || lecturesPerWeek <= 0) {
        showToast('Please enter a valid number for Sessions Per Week', 'warning');
        return;
    }
    if (isNaN(totalLectures) || totalLectures <= 0) {
        showToast('Please enter a valid number for Total Lectures', 'warning');
        return;
    }

    const subjectData = {
        code: upperCode,
        name,
        type: subjectType,
        classId,
        teacherId,
        lecturesPerWeek,
        totalLectures,
        completedLectures: 0
    };

    // Add practical-specific fields
    if (subjectType === 'practical') {
        subjectData.practicalDuration = parseInt(document.getElementById('practicalDuration').value) || 2;

        const isBatchBased = document.getElementById('isBatchBased')?.checked || false;
        subjectData.isBatchBased = isBatchBased;

        if (isBatchBased) {
            // Collect batch teacher/lab assignments
            const classData = classesData[classId];
            const batches = classData?.labBatches || [];

            const batchTeachers = {};
            const batchLabs = {};

            for (const batch of batches) {
                const teacherSelect = document.getElementById(`batchTeacher_${batch}`);
                const labSelect = document.getElementById(`batchLab_${batch}`);

                if (teacherSelect && teacherSelect.value) {
                    batchTeachers[batch] = teacherSelect.value;
                }
                if (labSelect && labSelect.value) {
                    batchLabs[batch] = labSelect.value;
                }
            }

            subjectData.batchTeachers = batchTeachers;
            subjectData.batchLabs = batchLabs;
        } else {
            // Single lab for all
            subjectData.labRoomId = document.getElementById('labRoom').value || null;
        }
    }

    console.log('Attempting to add subject:', subjectData);

    try {
        await database.ref(`subjects/${subjectId}`).set(subjectData);
        console.log('Subject added successfully:', subjectId);
        showToast('Subject added successfully!', 'success');
        document.getElementById('subjectForm').reset();
        autoGenerateSubjectId();
        document.getElementById('practicalFields').style.display = 'none';
        document.getElementById('singleLabFields').style.display = 'none';
        document.getElementById('batchBasedFields').style.display = 'none';
    } catch (error) {
        console.error('Error adding subject:', { code: error.code, message: error.message, error });
        showToast('Error adding subject: ' + error.message, 'danger');
    }
}

function editSubject(subjectId) {
    const data = subjectsData[subjectId];
    const subjectType = data.type || 'theory';
    const isBatchBased = data.isBatchBased || false;

    // Build class options - using escapeHtml for safety
    const classOptions = Object.entries(classesData).map(([id, cls]) =>
        `<option value="${escapeHtml(id)}" ${id === data.classId ? 'selected' : ''}>${escapeHtml(cls.name)} (${escapeHtml(id)})</option>`
    ).join('');

    // Build teacher options (for default teacher)
    const teacherOptions = Object.entries(teachersData).map(([id, teacher]) =>
        `<option value="${escapeHtml(id)}" ${id === data.teacherId ? 'selected' : ''}>${escapeHtml(teacher.name)} (${escapeHtml(id)})</option>`
    ).join('');

    // Build lab room options
    const labOptions = Object.entries(roomsData)
        .filter(([_, room]) => room.type === 'lab')
        .map(([id, room]) =>
            `<option value="${escapeHtml(id)}" ${id === data.labRoomId ? 'selected' : ''}>${escapeHtml(room.name)} (${escapeHtml(id)})</option>`
        ).join('');

    const practicalDuration = data.practicalDuration || 2;

    // Store subject data for batch assignment population
    window._editSubjectData = data;

    showEditModal('Edit Subject', `
        <div class="mb-3">
            <label class="form-label">Subject ID</label>
            <input type="text" class="form-control" id="editSubjectId" value="${escapeHtml(subjectId)}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">Subject Code</label>
            <input type="text" class="form-control" id="editSubjectCode" value="${escapeHtml(data.code || '')}" required>
        </div>
        <div class="mb-3">
            <label class="form-label">Subject Name</label>
            <input type="text" class="form-control" id="editSubjectName" value="${escapeHtml(data.name)}" required>
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
            <select class="form-select" id="editSubjectClass" required onchange="populateEditBatchAssignments()">
                <option value="">Select Class</option>
                ${classOptions}
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Default Teacher</label>
            <select class="form-select" id="editSubjectTeacher" required>
                <option value="">Select Teacher</option>
                ${teacherOptions}
            </select>
            <small class="text-muted">Used for theory or non-batch practicals</small>
        </div>
        <div class="row">
            <div class="col-md-6 mb-3">
                <label class="form-label">Sessions Per Week</label>
                <input type="number" class="form-control" id="editLecturesPerWeek" value="${data.lecturesPerWeek}" min="1" max="10" required>
            </div>
            <div class="col-md-6 mb-3">
                <label class="form-label">Total Lectures (Syllabus)</label>
                <input type="number" class="form-control" id="editTotalLectures" value="${data.totalLectures || 0}" min="1" max="100" required>
            </div>
        </div>
        <div id="editPracticalFields" style="display: ${subjectType === 'practical' ? 'block' : 'none'};">
            <div class="mb-3">
                <label class="form-label">Duration (Periods)</label>
                <select class="form-select" id="editPracticalDuration">
                    <option value="2" ${practicalDuration === 2 ? 'selected' : ''}>2 Periods (2 hours)</option>
                    <option value="3" ${practicalDuration === 3 ? 'selected' : ''}>3 Periods (3 hours)</option>
                </select>
            </div>
            <div class="mb-3">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="editIsBatchBased" ${isBatchBased ? 'checked' : ''} onchange="toggleEditBatchBasedFields()">
                    <label class="form-check-label" for="editIsBatchBased">
                        <strong>Batch-Based Practical</strong>
                    </label>
                </div>
                <small class="text-muted">Different teachers/labs per batch</small>
            </div>
            <!-- Non-batch lab room -->
            <div id="editSingleLabFields" style="display: ${!isBatchBased ? 'block' : 'none'};">
                <div class="mb-3">
                    <label class="form-label">Lab Room</label>
                    <select class="form-select" id="editLabRoom">
                        <option value="">Select Lab</option>
                        ${labOptions}
                    </select>
                </div>
            </div>
            <!-- Batch-based fields -->
            <div id="editBatchBasedFields" style="display: ${isBatchBased ? 'block' : 'none'};">
                <div class="alert alert-info mb-3">
                    <i class="bi bi-info-circle"></i> Assign teachers and labs for each batch.
                </div>
                <div id="editBatchAssignmentsContainer">
                    <p class="text-muted">Loading batch assignments...</p>
                </div>
            </div>
        </div>
    `, async () => {
        const code = document.getElementById('editSubjectCode').value.trim();
        const upperCode = code.toUpperCase();
        const validPrefixes = ['FY', 'SY', 'TE', 'BE'];
        const hasValidPrefix = validPrefixes.some(prefix => upperCode.startsWith(prefix));

        if (!hasValidPrefix) {
            showToast('Invalid Subject Code! Must start with FY, SY, TE, or BE (e.g., SY101)', 'danger');
            return;
        }

        const name = document.getElementById('editSubjectName').value.trim();
        const type = document.getElementById('editSubjectType').value;
        const classId = document.getElementById('editSubjectClass').value;
        const teacherId = document.getElementById('editSubjectTeacher').value;
        const lecturesPerWeek = parseInt(document.getElementById('editLecturesPerWeek').value);
        const totalLectures = parseInt(document.getElementById('editTotalLectures').value);

        const updateData = { code: upperCode, name, type, classId, teacherId, lecturesPerWeek, totalLectures };

        if (type === 'practical') {
            updateData.practicalDuration = parseInt(document.getElementById('editPracticalDuration').value) || 2;
            const isBatchBasedChecked = document.getElementById('editIsBatchBased')?.checked || false;
            updateData.isBatchBased = isBatchBasedChecked;

            if (isBatchBasedChecked) {
                // Collect batch teacher/lab assignments
                const classData = classesData[classId];
                const batches = classData?.labBatches || [];

                const batchTeachers = {};
                const batchLabs = {};

                for (const batch of batches) {
                    const teacherSelect = document.getElementById(`editBatchTeacher_${batch}`);
                    const labSelect = document.getElementById(`editBatchLab_${batch}`);

                    if (teacherSelect && teacherSelect.value) {
                        batchTeachers[batch] = teacherSelect.value;
                    }
                    if (labSelect && labSelect.value) {
                        batchLabs[batch] = labSelect.value;
                    }
                }

                updateData.batchTeachers = batchTeachers;
                updateData.batchLabs = batchLabs;
                updateData.labRoomId = null; // Clear single lab
            } else {
                updateData.labRoomId = document.getElementById('editLabRoom').value || null;
                updateData.batchTeachers = null;
                updateData.batchLabs = null;
            }
        } else {
            // Clear practical fields if changed to theory
            updateData.labRoomId = null;
            updateData.practicalDuration = null;
            updateData.isBatchBased = false;
            updateData.batchTeachers = null;
            updateData.batchLabs = null;
        }

        await database.ref(`subjects/${subjectId}`).update(updateData);
        showToast('Subject updated successfully!', 'success');
    });

    // Populate batch assignments after modal is shown
    setTimeout(() => {
        if (isBatchBased) {
            populateEditBatchAssignments();
        }
    }, 100);
}

// Toggle practical fields in edit modal
function toggleEditPracticalFields() {
    const subjectType = document.getElementById('editSubjectType').value;
    const practicalFields = document.getElementById('editPracticalFields');
    if (practicalFields) {
        practicalFields.style.display = subjectType === 'practical' ? 'block' : 'none';
    }
    // Reset batch-based when switching
    if (subjectType !== 'practical') {
        const singleLabFields = document.getElementById('editSingleLabFields');
        const batchBasedFields = document.getElementById('editBatchBasedFields');
        const isBatchBasedCheckbox = document.getElementById('editIsBatchBased');
        if (singleLabFields) singleLabFields.style.display = 'none';
        if (batchBasedFields) batchBasedFields.style.display = 'none';
        if (isBatchBasedCheckbox) isBatchBasedCheckbox.checked = false;
    } else {
        toggleEditBatchBasedFields();
    }
}

// Toggle batch-based fields in edit modal
function toggleEditBatchBasedFields() {
    const isBatchBasedChecked = document.getElementById('editIsBatchBased')?.checked || false;
    const singleLabFields = document.getElementById('editSingleLabFields');
    const batchBasedFields = document.getElementById('editBatchBasedFields');

    if (singleLabFields) {
        singleLabFields.style.display = isBatchBasedChecked ? 'none' : 'block';
    }

    if (batchBasedFields) {
        batchBasedFields.style.display = isBatchBasedChecked ? 'block' : 'none';
        if (isBatchBasedChecked) {
            populateEditBatchAssignments();
        }
    }
}

// Populate batch assignment rows in edit modal - using safe DOM methods
function populateEditBatchAssignments() {
    const classId = document.getElementById('editSubjectClass').value;
    const container = document.getElementById('editBatchAssignmentsContainer');
    const subjectData = window._editSubjectData || {};

    if (!container) return;

    // Clear container safely
    container.textContent = '';

    if (!classId) {
        const msg = document.createElement('p');
        msg.className = 'text-muted';
        msg.textContent = 'Select a class first to see available batches.';
        container.appendChild(msg);
        return;
    }

    const classData = classesData[classId];
    const batches = classData?.labBatches || [];

    if (batches.length === 0) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-warning';
        alert.textContent = 'This class has no lab batches configured.';
        container.appendChild(alert);
        return;
    }

    // Get existing batch assignments
    const existingBatchTeachers = subjectData.batchTeachers || {};
    const existingBatchLabs = subjectData.batchLabs || {};

    // Create table for batch assignments using DOM methods
    const table = document.createElement('table');
    table.className = 'table table-sm table-bordered';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.className = 'table-light';
    ['Batch', 'Teacher', 'Lab Room'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        if (text === 'Batch') th.style.width = '80px';
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    batches.forEach(batch => {
        const selectedTeacher = existingBatchTeachers[batch] || '';
        const selectedLab = existingBatchLabs[batch] || '';

        const row = document.createElement('tr');

        // Batch cell
        const batchCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = 'badge bg-primary';
        badge.textContent = batch;
        batchCell.appendChild(badge);
        row.appendChild(batchCell);

        // Teacher select cell
        const teacherCell = document.createElement('td');
        const teacherSelect = document.createElement('select');
        teacherSelect.className = 'form-select form-select-sm';
        teacherSelect.id = `editBatchTeacher_${batch}`;

        const defaultTeacherOpt = document.createElement('option');
        defaultTeacherOpt.value = '';
        defaultTeacherOpt.textContent = 'Select Teacher';
        teacherSelect.appendChild(defaultTeacherOpt);

        Object.entries(teachersData).forEach(([id, tData]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = tData.name;
            if (id === selectedTeacher) opt.selected = true;
            teacherSelect.appendChild(opt);
        });
        teacherCell.appendChild(teacherSelect);
        row.appendChild(teacherCell);

        // Lab select cell
        const labCell = document.createElement('td');
        const labSelect = document.createElement('select');
        labSelect.className = 'form-select form-select-sm';
        labSelect.id = `editBatchLab_${batch}`;

        const defaultLabOpt = document.createElement('option');
        defaultLabOpt.value = '';
        defaultLabOpt.textContent = 'Select Lab';
        labSelect.appendChild(defaultLabOpt);

        Object.entries(roomsData).filter(([_, room]) => room.type === 'lab').forEach(([id, rData]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = rData.name;
            if (id === selectedLab) opt.selected = true;
            labSelect.appendChild(opt);
        });
        labCell.appendChild(labSelect);
        row.appendChild(labCell);

        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
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
    const periodOrder = [1, 2, 3, 4, 'B1', 5, 6, 7, 'B2', 8, 9];
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
    // 8:15am to 5:45pm schedule with breaks
    // Morning: P1-P4 (8:15-12:15), then 1hr lunch break
    // Afternoon: P5-P7 (13:15-16:15), then 15 min short break
    // Evening: P8-P9 (16:30-18:30)
    // Practical slots: P5-P6 (13:15-15:15) or P6-P7 (14:15-16:15) for 2-hour practicals
    const periods = [
        { period: 1, start: '08:15', end: '09:15', type: 'class' },
        { period: 2, start: '09:15', end: '10:15', type: 'class' },
        { period: 3, start: '10:15', end: '11:15', type: 'class' },
        { period: 4, start: '11:15', end: '12:15', type: 'class' },
        { period: 'B1', start: '12:15', end: '13:15', type: 'break', label: 'Lunch Break' },
        { period: 5, start: '13:15', end: '14:15', type: 'class' },
        { period: 6, start: '14:15', end: '15:15', type: 'class' },
        { period: 7, start: '15:15', end: '16:15', type: 'class' },
        { period: 'B2', start: '16:15', end: '16:30', type: 'break', label: 'Short Break' },
        { period: 8, start: '16:30', end: '17:30', type: 'class' },
        { period: 9, start: '17:30', end: '18:30', type: 'class' }
    ];

    console.log('Generating default time slots (8:15am-5:45pm with breaks)...');

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

    select.onchange = async () => {
        populateBatchFilterDropdown();
        if (select.value) {
            if (typeof displayTimetable === 'function') {
                await displayTimetable(select.value);
                
                // If it's a preview in memory, show the actions!
                if (window.previewTimetables && window.previewTimetables[select.value]) {
                    showTimetableActions(select.value, window.previewTimetables[select.value]);
                } else {
                    // Otherwise check the database
                    const tSnap = await database.ref(`timetables/${select.value}`).once('value');
                    const tData = tSnap.val();
                    if (tData && tData.status) {
                        showTimetableActions(select.value, tData);
                    } else {
                        document.getElementById('saveDraftBtn').style.display = 'none';
                        document.getElementById('publishBtn').style.display = 'none';
                        document.getElementById('exportExcelBtn').style.display = 'none';
                    }
                }
            }
        } else {
            loadExistingTimetables();
        }
    };
}

// Populate batch filter dropdown based on selected class
function populateBatchFilterDropdown() {
    const classSelect = document.getElementById('timetableClass');
    const batchSelect = document.getElementById('timetableBatchFilter');

    if (!batchSelect) return;

    const classId = classSelect.value;
    batchSelect.innerHTML = '<option value="">All Batches</option>';

    if (!classId) {
        batchSelect.disabled = true;
        return;
    }

    const classData = classesData[classId];
    const batches = classData?.labBatches || [];

    if (batches.length === 0) {
        batchSelect.disabled = true;
        return;
    }

    batchSelect.disabled = false;
    batches.forEach(batch => {
        batchSelect.innerHTML += `<option value="${escapeHtml(batch)}">${escapeHtml(batch)}</option>`;
    });
}

// Filter timetable display by batch
async function filterTimetableByBatch() {
    const classSelect = document.getElementById('timetableClass');
    const batchSelect = document.getElementById('timetableBatchFilter');

    const classId = classSelect.value;
    const batchFilter = batchSelect.value;

    if (!classId) return;

    // Re-display timetable with batch filter
    await displayTimetableWithBatchFilter(classId, batchFilter);
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
            const timetableInfo = timetables[classId] || {};
            const entryCount = Object.keys(timetableInfo).filter(k => !['status', 'updatedAt', 'publishedAt', 'createdBy', 'updatedBy', 'publishedBy'].includes(k)).length;
            const status = timetableInfo.status || 'draft';
            const statusBadge = status === 'published'
                ? '<span class="badge bg-success ms-2">Published</span>'
                : '<span class="badge bg-secondary ms-2">Draft</span>';

            summaryHtml += `
                <div class="col-md-4">
                    <div class="card h-100 timetable-summary-card" style="cursor: pointer;" onclick="viewClassTimetable('${classId}')">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="bi bi-calendar-week text-primary"></i>
                                ${classData.name}
                                ${statusBadge}
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
            // Show action buttons
            showTimetableActions(selectedClass, timetables[selectedClass]);
        } else {
            // Show the summary
            container.innerHTML = summaryHtml;
        }

        // Load saved timetables list
        loadSavedTimetables();

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
    const emptyState = `<div class="empty-state">
        <i class="bi bi-calendar-x"></i>
        <h5>No Timetable Generated</h5>
        <p>Click "Generate Timetable" to create a schedule</p>
    </div>`;

    const hideComparison = () => {
        const p = document.getElementById('roomComparisonPanel');
        if (p) p.style.display = 'none';
    };

    if (selectedClass) {
        if (confirm(`Are you sure you want to clear the timetable for "${selectedClass}"?`)) {
            try {
                await database.ref(`timetables/${selectedClass}`).remove();
                showToast('Timetable cleared!', 'success');
                document.getElementById('timetableContainer').innerHTML = emptyState;
                hideComparison();
            } catch (error) {
                showToast('Error clearing timetable: ' + error.message, 'danger');
            }
        }
    } else {
        if (confirm('Are you sure you want to clear ALL timetables?')) {
            try {
                await database.ref('timetables').remove();
                showToast('All timetables cleared!', 'success');
                document.getElementById('timetableContainer').innerHTML = emptyState;
                hideComparison();
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

// ==================== AI SETTINGS FUNCTIONS ====================

// Setup AI config status display
function setupAIConfigForm() {
    // Load and display current configuration status
    loadAIConfig();
}

// Load and display AI config status
function loadAIConfig() {
    const statusDiv = document.getElementById('aiConfigStatus');
    if (!statusDiv) return;

    try {
        const modelInfo = GeminiAI.getModelInfo();
        if (modelInfo.configured) {
            statusDiv.className = 'alert alert-success';
            statusDiv.innerHTML = `<i class="bi bi-check-circle"></i> <strong>Configured</strong> - Using model: <code>${modelInfo.model}</code>`;
        } else {
            statusDiv.className = 'alert alert-warning';
            statusDiv.innerHTML = '<i class="bi bi-exclamation-triangle"></i> <strong>Not Configured</strong> - Please add your API key to <code>js/config.js</code>';
        }
    } catch (error) {
        console.error('Error loading AI config:', error);
        statusDiv.className = 'alert alert-danger';
        statusDiv.innerHTML = '<i class="bi bi-x-circle"></i> Error checking configuration.';
    }
}

// Test Gemini connection
async function testGeminiConnection() {
    const statusDiv = document.getElementById('aiConnectionStatus');
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '<div class="alert alert-info"><i class="bi bi-hourglass-split"></i> Testing connection...</div>';

    try {
        const isConfigured = GeminiAI.isConfigured();
        if (!isConfigured) {
            statusDiv.innerHTML = '<div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> No API key configured. Please add your API key to <code>js/config.js</code> and refresh the page.</div>';
            return;
        }

        // Try a simple test prompt
        const result = await GeminiAI.getSchedulingSuggestions(
            { test: { name: 'Test Subject', type: 'theory', lecturesPerWeek: 3 } },
            { T1: { name: 'Test Teacher', dept: 'Test' } },
            { C1: { name: 'Test Class', dept: 'Test' } },
            { R1: { name: 'Room 1', type: 'classroom', capacity: 60 } },
            { S1: { day: 'Monday', period: 1, type: 'class' } }
        );

        if (result.success) {
            const modelInfo = GeminiAI.getModelInfo();
            statusDiv.innerHTML = `<div class="alert alert-success"><i class="bi bi-check-circle"></i> Connection successful! Model <code>${modelInfo.model}</code> is ready to use.</div>`;
        } else {
            statusDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle"></i> Connection failed: ${result.error}</div>`;
        }
    } catch (error) {
        statusDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle"></i> Error: ${error.message}</div>`;
    }
}

// ==================== AI TIMETABLE FUNCTIONS ====================

// Get AI suggestions before generating timetable
async function getAISuggestions() {
    const panel = document.getElementById('aiSuggestionsPanel');
    const content = document.getElementById('aiSuggestionsContent');

    // Check if AI is configured
    const isConfigured = await GeminiAI.isConfigured();
    if (!isConfigured) {
        showToast('Gemini AI is not configured. Please add your API key in js/config.js', 'danger');
        return;
    }

    // Show panel with loading state
    panel.style.display = 'block';
    content.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border text-info" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Analyzing your data and generating suggestions...</p>
        </div>
    `;

    try {
        const result = await GeminiAI.getSchedulingSuggestions(
            subjectsData,
            teachersData,
            classesData,
            roomsData,
            slotsData
        );

        if (result.success) {
            content.innerHTML = `
                <div class="ai-suggestions">
                    ${GeminiAI.formatResponse(result.suggestions)}
                </div>
                <div class="mt-3">
                    <button class="btn btn-sm btn-outline-secondary" onclick="hideAISuggestions()">
                        <i class="bi bi-x"></i> Close
                    </button>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle"></i> Error getting suggestions: ${result.error}
                </div>
                <button class="btn btn-sm btn-outline-secondary" onclick="hideAISuggestions()">
                    <i class="bi bi-x"></i> Close
                </button>
            `;
        }
    } catch (error) {
        content.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error: ${error.message}
            </div>
            <button class="btn btn-sm btn-outline-secondary" onclick="hideAISuggestions()">
                <i class="bi bi-x"></i> Close
            </button>
        `;
    }
}

// Hide AI suggestions panel
function hideAISuggestions() {
    document.getElementById('aiSuggestionsPanel').style.display = 'none';
}

// Analyze generated timetable with AI
async function analyzeWithAI() {
    const panel = document.getElementById('aiAnalysisPanel');
    const content = document.getElementById('aiAnalysisContent');

    // Check if AI is configured
    const isConfigured = await GeminiAI.isConfigured();
    if (!isConfigured) {
        showToast('Gemini AI is not configured. Please add your API key in js/config.js', 'danger');
        return;
    }

    // Show panel with loading state
    panel.style.display = 'block';
    content.innerHTML = `
        <div class="text-center py-3">
            <div class="spinner-border text-warning" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Analyzing timetable for conflicts and improvements...</p>
        </div>
    `;

    try {
        // Fetch current timetables
        const timetablesSnap = await database.ref('timetables').once('value');
        const timetableData = timetablesSnap.val() || {};

        const result = await GeminiAI.getConflictAnalysis(
            timetableData,
            subjectsData,
            teachersData,
            classesData,
            slotsData
        );

        if (result.success) {
            content.innerHTML = `
                <div class="ai-analysis">
                    ${GeminiAI.formatResponse(result.analysis)}
                </div>
                <div class="mt-3">
                    <button class="btn btn-sm btn-outline-secondary" onclick="hideAIAnalysis()">
                        <i class="bi bi-x"></i> Close Analysis
                    </button>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="alert alert-danger mb-0">
                    <i class="bi bi-exclamation-triangle"></i> Error analyzing timetable: ${result.error}
                </div>
            `;
        }
    } catch (error) {
        content.innerHTML = `
            <div class="alert alert-danger mb-0">
                <i class="bi bi-exclamation-triangle"></i> Error: ${error.message}
            </div>
        `;
    }
}

// Hide AI analysis panel
function hideAIAnalysis() {
    document.getElementById('aiAnalysisPanel').style.display = 'none';
}

// Show AI Analyze button after timetable generation
function showAIAnalyzeButton() {
    const btn = document.getElementById('aiAnalyzeBtn');
    if (btn) {
        btn.style.display = 'inline-block';
    }
}

// Initialize AI features when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Setup AI config form (delay to ensure DOM is ready)
    setTimeout(() => {
        setupAIConfigForm();
    }, 500);
});

// ==================== REPORTS & ANALYTICS ====================

// Store report data for export
let currentReportData = {
    subjects: [],
    teachers: [],
    classes: []
};

// Populate report filter dropdowns
function populateReportFilters() {
    const classFilter = document.getElementById('reportClassFilter');
    if (!classFilter) return;

    classFilter.innerHTML = '<option value="">All Classes</option>';
    Object.entries(classesData).forEach(([id, cls]) => {
        classFilter.innerHTML += `<option value="${id}">${cls.name}</option>`;
    });
}

// Load all reports
async function loadReports() {
    await Promise.all([
        loadSubjectProgressReport(),
        loadTeacherWorkloadReport(),
        loadClassCompletionReport()
    ]);
}

// Load subject progress report
async function loadSubjectProgressReport() {
    const container = document.getElementById('subjectProgressReport');
    if (!container) return;

    const classFilter = document.getElementById('reportClassFilter')?.value || '';

    try {
        // Get all lecture records
        const recordsSnap = await database.ref('lectureRecords').once('value');
        const allRecords = recordsSnap.val() || {};

        // Calculate progress for each subject
        const subjectProgress = [];

        Object.entries(subjectsData).forEach(([subjectId, subject]) => {
            if (classFilter && subject.classId !== classFilter) return;

            const classRecords = allRecords[subject.classId] || {};
            let completed = 0;

            Object.values(classRecords).forEach(dateRecords => {
                Object.values(dateRecords).forEach(record => {
                    if (record.subjectId === subjectId &&
                        (record.status === 'conducted' || record.status === 'substituted')) {
                        completed++;
                    }
                });
            });

            const total = subject.totalLectures || 0;
            const remaining = Math.max(0, total - completed);
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

            subjectProgress.push({
                id: subjectId,
                code: subject.code || subjectId,
                name: subject.name,
                className: classesData[subject.classId]?.name || subject.classId,
                teacherName: teachersData[subject.teacherId]?.name || 'Unassigned',
                total,
                completed,
                remaining,
                percent
            });
        });

        // Sort by progress percentage
        subjectProgress.sort((a, b) => a.percent - b.percent);

        currentReportData.subjects = subjectProgress;

        if (subjectProgress.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3">No subjects found.</div>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Subject</th>
                            <th>Class</th>
                            <th>Teacher</th>
                            <th>Required</th>
                            <th>Completed</th>
                            <th>Remaining</th>
                            <th style="min-width: 200px;">Progress</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${subjectProgress.map(s => {
                            const progressClass = s.percent >= 80 ? 'bg-success' :
                                                  s.percent >= 50 ? 'bg-warning' : 'bg-danger';
                            return `
                                <tr>
                                    <td><strong>${s.name}</strong><br><small class="text-muted">${s.code}</small></td>
                                    <td>${s.className}</td>
                                    <td>${s.teacherName}</td>
                                    <td>${s.total}</td>
                                    <td>${s.completed}</td>
                                    <td>${s.remaining}</td>
                                    <td>
                                        <div class="progress" style="height: 25px;">
                                            <div class="progress-bar ${progressClass}" style="width: ${s.percent}%">
                                                ${s.percent}%
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
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading report: ${error.message}</div>`;
    }
}

// Load teacher workload report
async function loadTeacherWorkloadReport() {
    const container = document.getElementById('teacherWorkloadReport');
    if (!container) return;

    try {
        // Get all lecture records
        const recordsSnap = await database.ref('lectureRecords').once('value');
        const allRecords = recordsSnap.val() || {};

        // Calculate workload for each teacher
        const teacherStats = {};

        Object.entries(teachersData).forEach(([teacherId, teacher]) => {
            teacherStats[teacherId] = {
                id: teacherId,
                name: teacher.name,
                dept: teacher.dept || 'N/A',
                scheduled: 0,
                conducted: 0,
                absent: 0,
                substituted: 0,
                substitutionsTaken: 0
            };
        });

        // Count from records
        Object.values(allRecords).forEach(classRecords => {
            Object.values(classRecords).forEach(dateRecords => {
                Object.values(dateRecords).forEach(record => {
                    const scheduled = record.scheduledTeacherId;
                    const actual = record.actualTeacherId;

                    if (teacherStats[scheduled]) {
                        teacherStats[scheduled].scheduled++;

                        if (record.status === 'conducted') {
                            teacherStats[scheduled].conducted++;
                        } else if (record.status === 'absent') {
                            teacherStats[scheduled].absent++;
                        } else if (record.status === 'substituted') {
                            if (scheduled === actual) {
                                teacherStats[scheduled].conducted++;
                            } else {
                                teacherStats[scheduled].substituted++;
                            }
                        }
                    }

                    // Count substitutions taken
                    if (record.status === 'substituted' && scheduled !== actual && teacherStats[actual]) {
                        teacherStats[actual].substitutionsTaken++;
                    }
                });
            });
        });

        const teacherData = Object.values(teacherStats).filter(t => t.scheduled > 0 || t.substitutionsTaken > 0);
        teacherData.sort((a, b) => b.scheduled - a.scheduled);

        currentReportData.teachers = teacherData;

        if (teacherData.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3">No lecture data found.</div>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Teacher</th>
                            <th>Department</th>
                            <th>Scheduled</th>
                            <th>Conducted</th>
                            <th>Absent</th>
                            <th>Substituted</th>
                            <th>Subs Taken</th>
                            <th>Attendance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teacherData.map(t => {
                            const attendanceRate = t.scheduled > 0 ?
                                Math.round((t.conducted / t.scheduled) * 100) : 100;
                            const rateClass = attendanceRate >= 90 ? 'text-success' :
                                              attendanceRate >= 70 ? 'text-warning' : 'text-danger';
                            return `
                                <tr>
                                    <td><strong>${t.name}</strong></td>
                                    <td>${t.dept}</td>
                                    <td>${t.scheduled}</td>
                                    <td><span class="badge bg-success">${t.conducted}</span></td>
                                    <td><span class="badge bg-danger">${t.absent}</span></td>
                                    <td><span class="badge bg-warning text-dark">${t.substituted}</span></td>
                                    <td><span class="badge bg-info">${t.substitutionsTaken}</span></td>
                                    <td class="${rateClass}"><strong>${attendanceRate}%</strong></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading report: ${error.message}</div>`;
    }
}

// Load class completion report
async function loadClassCompletionReport() {
    const container = document.getElementById('classCompletionReport');
    if (!container) return;

    const classFilter = document.getElementById('reportClassFilter')?.value || '';

    try {
        // Get all lecture records
        const recordsSnap = await database.ref('lectureRecords').once('value');
        const allRecords = recordsSnap.val() || {};

        // Calculate completion for each class
        const classStats = [];

        Object.entries(classesData).forEach(([classId, cls]) => {
            if (classFilter && classId !== classFilter) return;

            // Get subjects for this class
            const classSubjects = Object.entries(subjectsData)
                .filter(([_, s]) => s.classId === classId);

            let totalRequired = 0;
            let totalCompleted = 0;

            const classRecords = allRecords[classId] || {};

            classSubjects.forEach(([subjectId, subject]) => {
                totalRequired += subject.totalLectures || 0;

                Object.values(classRecords).forEach(dateRecords => {
                    Object.values(dateRecords).forEach(record => {
                        if (record.subjectId === subjectId &&
                            (record.status === 'conducted' || record.status === 'substituted')) {
                            totalCompleted++;
                        }
                    });
                });
            });

            const remaining = Math.max(0, totalRequired - totalCompleted);
            const percent = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;

            classStats.push({
                id: classId,
                name: cls.name,
                batch: batchesData[cls.batchId]?.name || 'N/A',
                subjectCount: classSubjects.length,
                totalRequired,
                totalCompleted,
                remaining,
                percent
            });
        });

        classStats.sort((a, b) => a.percent - b.percent);

        currentReportData.classes = classStats;

        if (classStats.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-3">No class data found.</div>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Class</th>
                            <th>Batch</th>
                            <th>Subjects</th>
                            <th>Total Lectures</th>
                            <th>Completed</th>
                            <th>Remaining</th>
                            <th style="min-width: 200px;">Overall Progress</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${classStats.map(c => {
                            const progressClass = c.percent >= 80 ? 'bg-success' :
                                                  c.percent >= 50 ? 'bg-warning' : 'bg-danger';
                            return `
                                <tr>
                                    <td><strong>${c.name}</strong></td>
                                    <td>${c.batch}</td>
                                    <td>${c.subjectCount}</td>
                                    <td>${c.totalRequired}</td>
                                    <td>${c.totalCompleted}</td>
                                    <td>${c.remaining}</td>
                                    <td>
                                        <div class="progress" style="height: 25px;">
                                            <div class="progress-bar ${progressClass}" style="width: ${c.percent}%">
                                                ${c.percent}%
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
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading report: ${error.message}</div>`;
    }
}

// ==================== LECTURE RECORDS ====================

// Populate records filter dropdowns
function populateRecordsFilters() {
    const classFilter = document.getElementById('recordsClassFilter');
    if (!classFilter) return;

    classFilter.innerHTML = '<option value="">All Classes</option>';
    Object.entries(classesData).forEach(([id, cls]) => {
        classFilter.innerHTML += `<option value="${id}">${cls.name}</option>`;
    });
}

// Clear records filters
function clearRecordsFilters() {
    document.getElementById('recordsClassFilter').value = '';
    document.getElementById('recordsDateFilter').value = '';
    document.getElementById('recordsStatusFilter').value = '';
    document.getElementById('lectureRecordsContainer').innerHTML =
        '<p class="text-muted">Select filters and click Search to view records.</p>';
    document.getElementById('recordsCount').textContent = '0 records';
}

// Load lecture records with filters
async function loadLectureRecords() {
    const container = document.getElementById('lectureRecordsContainer');
    const countBadge = document.getElementById('recordsCount');
    if (!container) return;

    const classFilter = document.getElementById('recordsClassFilter')?.value || '';
    const dateFilter = document.getElementById('recordsDateFilter')?.value || '';
    const statusFilter = document.getElementById('recordsStatusFilter')?.value || '';

    container.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary"></div></div>';

    try {
        const recordsSnap = await database.ref('lectureRecords').once('value');
        const allRecords = recordsSnap.val() || {};

        // Check if any records exist at all
        const hasAnyRecords = Object.keys(allRecords).length > 0;

        const filteredRecords = [];

        Object.entries(allRecords).forEach(([classId, classRecords]) => {
            if (classFilter && classId !== classFilter) return;

            Object.entries(classRecords).forEach(([date, dateRecords]) => {
                if (dateFilter && date !== dateFilter) return;

                Object.entries(dateRecords).forEach(([slotId, record]) => {
                    if (statusFilter && record.status !== statusFilter) return;

                    filteredRecords.push({
                        classId,
                        className: classesData[classId]?.name || classId,
                        date,
                        slotId,
                        period: slotId.split('-P')[1],
                        ...record,
                        subjectName: subjectsData[record.subjectId]?.name || record.subjectId,
                        scheduledTeacherName: teachersData[record.scheduledTeacherId]?.name || record.scheduledTeacherId,
                        actualTeacherName: teachersData[record.actualTeacherId]?.name || record.actualTeacherId
                    });
                });
            });
        });

        // Sort by date descending
        filteredRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

        countBadge.textContent = `${filteredRecords.length} records`;

        if (filteredRecords.length === 0) {
            if (!hasAnyRecords) {
                container.innerHTML = `
                    <div class="text-center py-4">
                        <i class="bi bi-clipboard-x text-muted" style="font-size: 3rem;"></i>
                        <p class="text-muted mt-3 mb-1">No lecture records yet</p>
                        <small class="text-muted">Faculty members can mark lecture attendance from their dashboard.</small>
                    </div>`;
            } else {
                container.innerHTML = '<div class="text-center text-muted py-3">No records found matching the filters.</div>';
            }
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Class</th>
                            <th>Period</th>
                            <th>Subject</th>
                            <th>Scheduled Teacher</th>
                            <th>Actual Teacher</th>
                            <th>Status</th>
                            <th>Marked By</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredRecords.map(r => {
                            const statusBadge = r.status === 'conducted' ?
                                '<span class="badge bg-success">Conducted</span>' :
                                r.status === 'absent' ?
                                '<span class="badge bg-danger">Absent</span>' :
                                '<span class="badge bg-warning text-dark">Substituted</span>';

                            const date = new Date(r.date).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                            });

                            return `
                                <tr>
                                    <td>${date}</td>
                                    <td>${r.className}</td>
                                    <td>P${r.period}</td>
                                    <td>${r.subjectName}</td>
                                    <td>${r.scheduledTeacherName}</td>
                                    <td>${r.actualTeacherName}
                                        ${r.scheduledTeacherId !== r.actualTeacherId ?
                                            '<small class="text-info">(Sub)</small>' : ''}
                                    </td>
                                    <td>${statusBadge}</td>
                                    <td><small class="text-muted">${new Date(r.markedAt).toLocaleString()}</small></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Error loading records: ${error.message}</div>`;
    }
}

// ==================== EXPORT FUNCTIONS ====================

// Export report to PDF
function exportReportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text('Progress Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

    let yPos = 40;

    // Subject Progress Table
    if (currentReportData.subjects.length > 0) {
        doc.setFontSize(14);
        doc.text('Subject-wise Progress', 14, yPos);
        yPos += 5;

        doc.autoTable({
            startY: yPos,
            head: [['Subject', 'Class', 'Required', 'Completed', 'Progress']],
            body: currentReportData.subjects.map(s => [
                s.name,
                s.className,
                s.total.toString(),
                s.completed.toString(),
                `${s.percent}%`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [13, 110, 253] }
        });

        yPos = doc.lastAutoTable.finalY + 15;
    }

    // Teacher Workload Table
    if (currentReportData.teachers.length > 0 && yPos < 250) {
        doc.setFontSize(14);
        doc.text('Teacher Workload', 14, yPos);
        yPos += 5;

        doc.autoTable({
            startY: yPos,
            head: [['Teacher', 'Scheduled', 'Conducted', 'Absent', 'Attendance']],
            body: currentReportData.teachers.map(t => [
                t.name,
                t.scheduled.toString(),
                t.conducted.toString(),
                t.absent.toString(),
                `${t.scheduled > 0 ? Math.round((t.conducted / t.scheduled) * 100) : 100}%`
            ]),
            theme: 'grid',
            headStyles: { fillColor: [13, 110, 253] }
        });
    }

    doc.save('progress-report.pdf');
    showToast('PDF exported successfully!', 'success');
}

// Export report to Excel
function exportReportExcel() {
    const wb = XLSX.utils.book_new();

    // Subject Progress Sheet
    if (currentReportData.subjects.length > 0) {
        const subjectData = currentReportData.subjects.map(s => ({
            'Subject Code': s.code,
            'Subject Name': s.name,
            'Class': s.className,
            'Teacher': s.teacherName,
            'Required Lectures': s.total,
            'Completed': s.completed,
            'Remaining': s.remaining,
            'Progress %': s.percent
        }));
        const ws1 = XLSX.utils.json_to_sheet(subjectData);
        XLSX.utils.book_append_sheet(wb, ws1, 'Subject Progress');
    }

    // Teacher Workload Sheet
    if (currentReportData.teachers.length > 0) {
        const teacherData = currentReportData.teachers.map(t => ({
            'Teacher Name': t.name,
            'Department': t.dept,
            'Scheduled': t.scheduled,
            'Conducted': t.conducted,
            'Absent': t.absent,
            'Substituted': t.substituted,
            'Substitutions Taken': t.substitutionsTaken,
            'Attendance %': t.scheduled > 0 ? Math.round((t.conducted / t.scheduled) * 100) : 100
        }));
        const ws2 = XLSX.utils.json_to_sheet(teacherData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Teacher Workload');
    }

    // Class Completion Sheet
    if (currentReportData.classes.length > 0) {
        const classData = currentReportData.classes.map(c => ({
            'Class': c.name,
            'Batch': c.batch,
            'Subjects': c.subjectCount,
            'Total Lectures': c.totalRequired,
            'Completed': c.totalCompleted,
            'Remaining': c.remaining,
            'Progress %': c.percent
        }));
        const ws3 = XLSX.utils.json_to_sheet(classData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Class Completion');
    }

    XLSX.writeFile(wb, 'progress-report.xlsx');
    showToast('Excel exported successfully!', 'success');
}

// ==================== TIMETABLE DRAFT/PUBLISH ====================

// Store current timetable state
let currentTimetableData = null;
let currentTimetableClassId = null;

// Show draft/publish buttons after generation
function showTimetableActions(classId, timetableData) {
    currentTimetableClassId = classId;
    currentTimetableData = timetableData;

    document.getElementById('saveDraftBtn').style.display = 'inline-block';
    document.getElementById('publishBtn').style.display = 'inline-block';
    document.getElementById('exportExcelBtn').style.display = 'inline-block';

    buildRoomComparisonPanel(timetableData);

    // Check existing status
    updateTimetableStatusBadge(classId);
}

function buildRoomComparisonPanel(timetableData) {
    const panel = document.getElementById('roomComparisonPanel');
    if (!panel) return;

    const totalWeekSlots = Object.values(slotsData).filter(s => s.type !== 'break').length;

    const roomUsage = {};

    const ensureRoom = (roomId, fallbackName) => {
        if (roomUsage[roomId]) return;
        const rd = roomsData[roomId];
        roomUsage[roomId] = {
            name: rd ? escapeHtml(rd.name || roomId) : escapeHtml(fallbackName || roomId),
            type: rd ? (rd.type || 'classroom') : 'classroom',
            capacity: rd && rd.capacity ? rd.capacity : null,
            theory: new Set(),
            practical: new Set(),
            batch: new Set()
        };
    };

    const slotIdPattern = /^[A-Z][a-z]{2}-P\d+$/;
    Object.entries(timetableData).forEach(([slotId, entry]) => {
        if (!slotIdPattern.test(slotId) || !entry || typeof entry !== 'object') return;

        if (entry.batchSchedule) {
            Object.values(entry.batchSchedule).forEach(batchInfo => {
                if (!batchInfo || !batchInfo.roomId) return;
                ensureRoom(batchInfo.roomId, batchInfo.roomName);
                roomUsage[batchInfo.roomId].batch.add(slotId);
            });
        } else if (entry.roomId) {
            ensureRoom(entry.roomId, entry.roomName);
            if (entry.subjectType === 'practical') {
                roomUsage[entry.roomId].practical.add(slotId);
            } else {
                roomUsage[entry.roomId].theory.add(slotId);
            }
        }
    });

    Object.entries(roomsData).forEach(([id, r]) => {
        ensureRoom(id, r.name);
        if (r.type) roomUsage[id].type = r.type;
    });

    const classrooms = Object.entries(roomUsage).filter(([, r]) => r.type !== 'lab');
    const labs = Object.entries(roomUsage).filter(([, r]) => r.type === 'lab');

    const byUsageDesc = ([, a], [, b]) =>
        (b.theory.size + b.practical.size + b.batch.size) -
        (a.theory.size + a.practical.size + a.batch.size);
    classrooms.sort(byUsageDesc);
    labs.sort(byUsageDesc);

    const renderRow = ([, r]) => {
        const total = r.theory.size + r.practical.size + r.batch.size;
        const pct = totalWeekSlots > 0 ? Math.round((total / totalWeekSlots) * 100) : 0;
        const barClass = pct >= 70 ? 'bg-danger' : pct >= 40 ? 'bg-warning' : pct > 0 ? 'bg-success' : 'bg-secondary';

        const days = new Set();
        [...r.theory, ...r.practical, ...r.batch].forEach(sid => days.add(sid.split('-')[0]));

        const allSlots = [...r.theory, ...r.practical, ...r.batch].join(', ') || 'Not used';

        const badges = [
            r.theory.size > 0 ? `<span class="badge bg-primary me-1">Theory ×${r.theory.size}</span>` : '',
            r.practical.size > 0 ? `<span class="badge bg-info text-dark me-1">Lab ×${r.practical.size}</span>` : '',
            r.batch.size > 0 ? `<span class="badge bg-success me-1">Batch ×${r.batch.size}</span>` : '',
            total === 0 ? '<span class="text-muted small">Unused</span>' : ''
        ].join('');

        return `<tr ${total === 0 ? 'class="table-secondary"' : ''}>
            <td>
                <strong>${r.name}</strong>
                ${r.capacity ? `<br><small class="text-muted">Cap: ${escapeHtml(String(r.capacity))}</small>` : ''}
            </td>
            <td>${badges}</td>
            <td><small>${days.size > 0 ? [...days].join(', ') : '–'}</small></td>
            <td>
                <div class="d-flex align-items-center gap-1">
                    <div class="progress flex-grow-1" style="height:8px;" title="${escapeHtml(allSlots)}">
                        <div class="progress-bar ${barClass}" style="width:${pct}%"></div>
                    </div>
                    <small class="text-nowrap">${pct}%</small>
                </div>
            </td>
        </tr>`;
    };

    const usedClassrooms = classrooms.filter(([, r]) => r.theory.size + r.practical.size + r.batch.size > 0).length;
    const usedLabs = labs.filter(([, r]) => r.theory.size + r.practical.size + r.batch.size > 0).length;

    const tableHead = `<thead class="table-light">
        <tr><th>Room</th><th>Assigned slots</th><th>Days active</th><th>Utilisation</th></tr>
    </thead>`;

    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="card shadow-sm">
            <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center py-2">
                <span><i class="bi bi-building-fill-gear me-2"></i><strong>Room Allocation Comparison</strong></span>
                <small class="text-white-50">Week total: ${totalWeekSlots} usable slots</small>
            </div>
            <div class="card-body">
                <div class="alert alert-info alert-sm py-2 mb-3 small">
                    <strong>Allocation basis — </strong>
                    <span class="badge bg-primary">Theory</span> First available classroom (non-lab) in DB iteration order; no capacity or proximity preference. &nbsp;
                    <span class="badge bg-info text-dark">Practical</span> Lab pre-assigned on the subject by admin; solver only checks availability. &nbsp;
                    <span class="badge bg-success">Batch</span> Per-batch lab from subject config; falls back to any free room if no lab assigned.
                </div>
                <div class="row g-3">
                    <div class="col-lg-6">
                        <div class="card h-100 border-primary">
                            <div class="card-header bg-primary text-white d-flex justify-content-between py-2">
                                <span><i class="bi bi-building me-1"></i> Classrooms</span>
                                <span class="badge bg-light text-primary">${usedClassrooms} / ${classrooms.length} used</span>
                            </div>
                            <div class="card-body p-0">
                                <div class="table-responsive">
                                    <table class="table table-sm table-hover mb-0">
                                        ${tableHead}
                                        <tbody>${classrooms.length ? classrooms.map(renderRow).join('') : '<tr><td colspan="4" class="text-center text-muted">No classrooms defined</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-6">
                        <div class="card h-100 border-success">
                            <div class="card-header bg-success text-white d-flex justify-content-between py-2">
                                <span><i class="bi bi-lightning-fill me-1"></i> Lab Rooms</span>
                                <span class="badge bg-light text-success">${usedLabs} / ${labs.length} used</span>
                            </div>
                            <div class="card-body p-0">
                                <div class="table-responsive">
                                    <table class="table table-sm table-hover mb-0">
                                        ${tableHead}
                                        <tbody>${labs.length ? labs.map(renderRow).join('') : '<tr><td colspan="4" class="text-center text-muted">No lab rooms defined</td></tr>'}</tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
}

// Export timetable to Excel using SheetJS (with batch-specific sheets)
async function exportTimetableToExcel() {
    if (!currentTimetableClassId) {
        showToast('No timetable to export', 'danger');
        return;
    }

    try {
        // Fetch timetable and slots
        const [timetableSnap, slotsSnap] = await Promise.all([
            database.ref(`timetables/${currentTimetableClassId}`).once('value'),
            database.ref('slots').once('value')
        ]);

        let timetable = timetableSnap.val() || {};
        
        // Use preview data if available
        if (window.previewTimetables && window.previewTimetables[currentTimetableClassId]) {
            timetable = window.previewTimetables[currentTimetableClassId];
        }

        const slots = slotsSnap.val() || {};
        const classData = classesData[currentTimetableClassId] || {};
        const className = classData.name || currentTimetableClassId;
        const labBatches = classData.labBatches || [];

        // Build period info
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const periodOrder = [1, 2, 3, 4, 'B1', 5, 6, 7, 'B2', 8, 9];
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

        // Build ordered periods
        const allPeriods = [];
        periodOrder.forEach(p => {
            if (periodInfo[p]) {
                allPeriods.push(periodInfo[p]);
            }
        });

        // Helper function to build worksheet data for a specific batch (or all batches)
        function buildWorksheetData(batchFilter = null) {
            const wsData = [];

            // Header row
            const headerRow = ['Day / Period'];
            allPeriods.forEach(p => {
                const isBreak = p.type === 'break';
                const label = isBreak ? (p.label || 'Break') : `Period ${p.period}`;
                headerRow.push(`${label}\n(${p.start} - ${p.end})`);
            });
            wsData.push(headerRow);

            // Data rows for each day
            days.forEach(day => {
                const row = [day];

                allPeriods.forEach(periodData => {
                    const isBreak = periodData.type === 'break';

                    if (isBreak) {
                        row.push(periodData.label || 'Break');
                    } else {
                        const slotId = `${day.substring(0, 3)}-P${periodData.period}`;
                        const entry = timetable[slotId];

                        if (entry) {
                            let cellContent = '';

                            if (entry.subjectType === 'batch-practical' && entry.batchSchedule) {
                                if (batchFilter) {
                                    // Show only specific batch info (with batch-specific subject for round-robin)
                                    const batchInfo = entry.batchSchedule[batchFilter];
                                    if (batchInfo) {
                                        // Use batch-specific subject name (round-robin support)
                                        cellContent = batchInfo.subjectName || entry.subjectName || '';
                                        cellContent += '\n[Lab - ' + batchFilter + ']\n' + batchInfo.teacherName + '\n' + batchInfo.roomName;
                                    } else {
                                        cellContent = entry.subjectName || 'Batch Practical';
                                        cellContent += '\n[Lab]\nN/A';
                                    }
                                } else {
                                    // Show all batches with their specific subjects (round-robin support)
                                    cellContent = 'Batch Practicals';
                                    const batchDetails = Object.entries(entry.batchSchedule)
                                        .map(([batch, info]) => {
                                            const subj = info.subjectName || entry.subjectName || '';
                                            return `${batch}: ${subj} - ${info.teacherName} (${info.roomName})`;
                                        })
                                        .join('\n');
                                    cellContent += '\n' + batchDetails;
                                }
                            } else if (entry.subjectType === 'practical') {
                                cellContent = entry.subjectName || '';
                                cellContent += '\n[Lab]\n' + (entry.teacherName || '') + '\n' + (entry.roomName || '');
                            } else {
                                cellContent = entry.subjectName || '';
                                cellContent += '\n' + (entry.teacherName || '') + '\n' + (entry.roomName || '');
                            }
                            row.push(cellContent);
                        } else {
                            row.push('-');
                        }
                    }
                });
                wsData.push(row);
            });

            return wsData;
        }

        // Helper function to create worksheet with proper formatting
        function createWorksheet(wsData) {
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Set column widths
            const colWidths = [{ wch: 12 }]; // Day column
            allPeriods.forEach(() => colWidths.push({ wch: 25 }));
            ws['!cols'] = colWidths;

            // Set row heights for better readability
            ws['!rows'] = [{ hpt: 40 }]; // Header row height
            days.forEach(() => ws['!rows'].push({ hpt: 80 }));

            return ws;
        }

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Sheet 1: Main timetable with all batches
        const mainWsData = buildWorksheetData(null);
        const mainWs = createWorksheet(mainWsData);
        XLSX.utils.book_append_sheet(wb, mainWs, (className + ' - All').substring(0, 31));

        // Add separate sheets for each batch (if batches exist)
        if (labBatches.length > 0) {
            for (const batch of labBatches) {
                const batchWsData = buildWorksheetData(batch);
                const batchWs = createWorksheet(batchWsData);
                const sheetName = (className + ' - ' + batch).substring(0, 31);
                XLSX.utils.book_append_sheet(wb, batchWs, sheetName);
            }
        }

        // Generate filename with date
        const date = new Date().toISOString().split('T')[0];
        const filename = `Timetable_${className.replace(/[^a-zA-Z0-9]/g, '_')}_${date}.xlsx`;

        // Download file
        XLSX.writeFile(wb, filename);

        const sheetCount = 1 + labBatches.length;
        showToast(`Timetable exported: ${filename} (${sheetCount} sheet${sheetCount > 1 ? 's' : ''})`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('Error exporting timetable: ' + error.message, 'danger');
    }
}

// Export all timetables to a single Excel file with multiple sheets
async function exportAllTimetables() {
    try {
        showToast('Preparing export...', 'info');

        // Fetch all data
        const [timetablesSnap, slotsSnap, classesSnap] = await Promise.all([
            database.ref('timetables').once('value'),
            database.ref('slots').once('value'),
            database.ref('classes').once('value')
        ]);

        const dbTimetables = timetablesSnap.val() || {};
        
        // Merge with preview timetables if available
        const allTimetables = { ...dbTimetables };
        if (window.previewTimetables) {
            Object.assign(allTimetables, window.previewTimetables);
        }

        const slots = slotsSnap.val() || {};
        const classes = classesSnap.val() || {};

        const classIds = Object.keys(allTimetables).filter(id => {
            const data = allTimetables[id];
            // Filter out metadata-only objects by ensuring at least one slot key exists
            return typeof data === 'object' && Object.keys(data).some(k => /^[A-Z][a-z]{2}-P\d+$/.test(k) || k.includes('-P') || k.includes('-B'));
        });

        if (classIds.length === 0) {
            showToast('No timetables to export', 'warning');
            return;
        }

        // Build period info
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const periodOrder = [1, 2, 3, 4, 'B1', 5, 6, 7, 'B2', 8, 9];
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

        const allPeriods = [];
        periodOrder.forEach(p => {
            if (periodInfo[p]) {
                allPeriods.push(periodInfo[p]);
            }
        });

        // Create workbook
        const wb = XLSX.utils.book_new();

        // Add a sheet for each class
        for (const classId of classIds) {
            const timetable = allTimetables[classId] || {};
            const baseId = timetable.baseClassId || classId;
            const className = timetable.draftName || classes[baseId]?.name || classId;

            // Create worksheet data
            const wsData = [];

            // Header row
            const headerRow = ['Day / Period'];
            allPeriods.forEach(p => {
                const isBreak = p.type === 'break';
                const label = isBreak ? (p.label || 'Break') : `Period ${p.period}`;
                headerRow.push(`${label}\n(${p.start} - ${p.end})`);
            });
            wsData.push(headerRow);

            // Data rows for each day
            days.forEach(day => {
                const row = [day];

                allPeriods.forEach(periodData => {
                    const isBreak = periodData.type === 'break';

                    if (isBreak) {
                        row.push(periodData.label || 'Break');
                    } else {
                        const slotId = `${day.substring(0, 3)}-P${periodData.period}`;
                        const entry = timetable[slotId];

                        if (entry) {
                            let cellContent = entry.subjectName || '';

                            if (entry.subjectType === 'batch-practical' && entry.batchSchedule) {
                                const batchInfo = Object.entries(entry.batchSchedule)
                                    .map(([batch, info]) => `${batch}: ${info.teacherName} (${info.roomName})`)
                                    .join('\n');
                                cellContent += '\n[Batch Lab]\n' + batchInfo;
                            } else if (entry.subjectType === 'practical') {
                                cellContent += '\n[Lab]\n' + (entry.teacherName || '') + '\n' + (entry.roomName || '');
                            } else {
                                cellContent += '\n' + (entry.teacherName || '') + '\n' + (entry.roomName || '');
                            }
                            row.push(cellContent);
                        } else {
                            row.push('-');
                        }
                    }
                });
                wsData.push(row);
            });

            // Create worksheet
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Set column widths
            const colWidths = [{ wch: 12 }];
            allPeriods.forEach(() => colWidths.push({ wch: 25 }));
            ws['!cols'] = colWidths;

            // Sheet name (max 31 chars, no special chars)
            const sheetName = className.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }

        // Generate filename with date
        const date = new Date().toISOString().split('T')[0];
        const filename = `All_Timetables_${date}.xlsx`;

        // Download file
        XLSX.writeFile(wb, filename);

        showToast(`Exported ${classIds.length} timetables to ${filename}`, 'success');
    } catch (error) {
        console.error('Export all error:', error);
        showToast('Error exporting timetables: ' + error.message, 'danger');
    }
}

// Update status badge
async function updateTimetableStatusBadge(classId) {
    const statusBadge = document.getElementById('timetableStatus');
    if (!statusBadge) return;

    try {
        const snapshot = await database.ref(`timetables/${classId}/status`).once('value');
        const status = snapshot.val() || 'draft';

        statusBadge.style.display = 'inline-block';
        if (status === 'published') {
            statusBadge.className = 'badge bg-success ms-2';
            statusBadge.textContent = 'Published';
        } else {
            statusBadge.className = 'badge bg-secondary ms-2';
            statusBadge.textContent = 'Draft';
        }
    } catch (error) {
        console.error('Error fetching timetable status:', error);
    }
}

// Save timetable as draft
async function saveTimetableAsDraft() {
    if (!currentTimetableClassId) return;

    try {
        const previewData = window.previewTimetables ? window.previewTimetables[currentTimetableClassId] : null;

        if (previewData) {
            // Check limit: 3 drafts per day per admin
            const today = new Date().toDateString();
            const snapshot = await database.ref('timetables').once('value');
            const timetables = snapshot.val() || {};
            const adminId = auth.currentUser.uid;
            
            let draftsToday = 0;
            Object.keys(timetables).forEach(key => {
                const t = timetables[key];
                if (t.status === 'draft' && t.updatedBy === adminId && t.baseClassId === currentTimetableClassId) {
                    if (t.updatedAt && new Date(t.updatedAt).toDateString() === today) {
                        draftsToday++;
                    }
                }
            });
            
            if (draftsToday >= 3) {
                showToast('Limit reached: You can only save 3 drafts per class per day.', 'danger');
                return;
            }

            const timestamp = Date.now();
            const dateStr = new Date(timestamp).toLocaleString();
            const className = classesData[currentTimetableClassId]?.name || currentTimetableClassId;
            const draftId = `${currentTimetableClassId}_draft_${timestamp}`;
            
            await database.ref(`timetables/${draftId}`).set({
                ...previewData,
                status: 'draft',
                baseClassId: currentTimetableClassId,
                draftName: `${className} - ${dateStr}`,
                updatedAt: timestamp,
                updatedBy: adminId
            });
            delete window.previewTimetables[currentTimetableClassId];
            showToast('New timetable combination saved as draft!', 'success');
        } else {
            await database.ref(`timetables/${currentTimetableClassId}`).update({
                status: 'draft',
                updatedAt: Date.now(),
                updatedBy: auth.currentUser.uid
            });
            showToast('Timetable saved as draft', 'success');
        }

        updateTimetableStatusBadge(currentTimetableClassId);
        loadSavedTimetables();
    } catch (error) {
        showToast('Error saving draft: ' + error.message, 'danger');
    }
}

// Publish timetable
async function publishTimetable() {
    if (!currentTimetableClassId) return;

    if (!confirm('Are you sure you want to publish this timetable? It will be visible to all users.')) {
        return;
    }

    try {
        const previewData = window.previewTimetables ? window.previewTimetables[currentTimetableClassId] : null;

        if (previewData) {
            await database.ref(`timetables/${currentTimetableClassId}`).set({
                ...previewData,
                status: 'published',
                publishedAt: Date.now(),
                publishedBy: auth.currentUser.uid
            });
            delete window.previewTimetables[currentTimetableClassId];
        } else {
            await database.ref(`timetables/${currentTimetableClassId}`).update({
                status: 'published',
                publishedAt: Date.now(),
                publishedBy: auth.currentUser.uid
            });
        }

        showToast('Timetable published successfully!', 'success');
        updateTimetableStatusBadge(currentTimetableClassId);
        loadSavedTimetables();
    } catch (error) {
        showToast('Error publishing: ' + error.message, 'danger');
    }
}

// Load saved timetables list
async function loadSavedTimetables() {
    const container = document.getElementById('savedTimetablesContainer');
    if (!container) return;

    try {
        const snapshot = await database.ref('timetables').once('value');
        const timetables = snapshot.val() || {};

        const timetableList = [];
        Object.entries(timetables).forEach(([classId, data]) => {
            if (data.status) {
                timetableList.push({
                    classId,
                    baseClassId: data.baseClassId || classId,
                    className: data.draftName || classesData[data.baseClassId || classId]?.name || classId,
                    status: data.status,
                    updatedAt: data.updatedAt,
                    publishedAt: data.publishedAt
                });
            }
        });

        if (timetableList.length === 0) {
            container.innerHTML = '<p class="text-muted">No saved timetables yet.</p>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover" id="savedTimetablesTable">
                    <thead>
                        <tr>
                            <th style="width: 40px;">
                                <input type="checkbox" class="form-check-input" id="selectAllTimetables" onchange="toggleSelectAllTimetables(this)">
                            </th>
                            <th>Class</th>
                            <th>Status</th>
                            <th>Last Updated</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${timetableList.map(t => {
                            const statusBadge = t.status === 'published' ?
                                '<span class="badge bg-success">Published</span>' :
                                '<span class="badge bg-secondary">Draft</span>';
                            const date = t.updatedAt ?
                                new Date(t.updatedAt).toLocaleString() : 'N/A';

                            return `
                                <tr>
                                    <td>
                                        <input type="checkbox" class="form-check-input tt-checkbox" value="${t.classId}" onchange="updateBulkActionState()">
                                    </td>
                                    <td><strong>${t.className}</strong></td>
                                    <td>${statusBadge}</td>
                                    <td><small>${date}</small></td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-primary" onclick="viewSavedTimetable('${t.classId}')">
                                            <i class="bi bi-eye"></i> View
                                        </button>
                                        ${t.status === 'draft' ? `
                                            <button class="btn btn-sm btn-success" onclick="quickPublish('${t.classId}')">
                                                <i class="bi bi-check"></i> Publish
                                            </button>
                                        ` : `
                                            <button class="btn btn-sm btn-warning" onclick="unpublishTimetable('${t.classId}')">
                                                <i class="bi bi-x"></i> Unpublish
                                            </button>
                                        `}
                                        <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteTimetable('${t.classId}')">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        updateBulkActionState();
    } catch (error) {
        container.innerHTML = `<p class="text-danger">Error loading timetables: ${error.message}</p>`;
    }
}

// Bulk Actions Logic
function toggleSelectAllTimetables(master) {
    const checkboxes = document.querySelectorAll('.tt-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
    updateBulkActionState();
}

function updateBulkActionState() {
    const checkboxes = document.querySelectorAll('.tt-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const bulkBar = document.getElementById('bulkTimetableActions');

    if (checkedCount > 0) {
        bulkBar.style.display = 'flex';
        // Update "Select All" state
        const master = document.getElementById('selectAllTimetables');
        if (master) master.checked = checkedCount === checkboxes.length;
    } else {
        bulkBar.style.display = 'none';
        const master = document.getElementById('selectAllTimetables');
        if (master) master.checked = false;
    }
}

async function bulkDeleteTimetables() {
    const checkboxes = document.querySelectorAll('.tt-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.value);

    if (ids.length === 0) return;

    if (confirm(`Are you sure you want to delete ${ids.length} selected timetable(s)?`)) {
        try {
            const updates = {};
            ids.forEach(id => {
                updates[id] = null;
            });
            await database.ref('timetables').update(updates);
            showToast(`${ids.length} timetables deleted!`, 'success');
            loadSavedTimetables();
        } catch (error) {
            showToast('Bulk delete failed: ' + error.message, 'danger');
        }
    }
}

async function bulkPublishTimetables() {
    const checkboxes = document.querySelectorAll('.tt-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.value);

    if (ids.length === 0) return;

    try {
        const updates = {};
        ids.forEach(id => {
            updates[`${id}/status`] = 'published';
            updates[`${id}/publishedAt`] = Date.now();
            updates[`${id}/publishedBy`] = auth.currentUser.uid;
        });
        await database.ref('timetables').update(updates);
        showToast(`${ids.length} timetables published!`, 'success');
        loadSavedTimetables();
    } catch (error) {
        showToast('Bulk publish failed: ' + error.message, 'danger');
    }
}

async function confirmDeleteTimetable(classId) {
    if (confirm(`Delete timetable for ${classId}?`)) {
        try {
            await database.ref(`timetables/${classId}`).remove();
            showToast('Timetable deleted!', 'success');
            loadSavedTimetables();
        } catch (error) {
            showToast('Delete failed: ' + error.message, 'danger');
        }
    }
}

// View saved timetable
async function viewSavedTimetable(classId) {
    currentTimetableClassId = classId;

    try {
        const snapshot = await database.ref(`timetables/${classId}`).once('value');
        const data = snapshot.val();

        if (data) {
            currentTimetableData = data;
            const baseClassId = data.baseClassId || classId;
            
            // Set the dropdown to the base class
            const select = document.getElementById('timetableClass');
            if (select) select.value = baseClassId;
            
            // Display the specific draft timetable
            if (typeof displayTimetable === 'function') {
                await displayTimetable(classId);
            }

            updateTimetableStatusBadge(classId);

            // Hide the summary and show the container if needed
            document.getElementById('savedTimetablesContainer').scrollIntoView({ behavior: 'smooth' });

            // Show action buttons safely
            const sBtn = document.getElementById('saveDraftBtn');
            const pBtn = document.getElementById('publishBtn');
            const eBtn = document.getElementById('exportExcelBtn');
            if (sBtn) sBtn.style.display = 'inline-block';
            if (pBtn) pBtn.style.display = 'inline-block';
            if (eBtn) eBtn.style.display = 'inline-block';
        }
    } catch (error) {
        showToast('Error loading timetable: ' + error.message, 'danger');
    }
}

// Quick publish from list
async function quickPublish(classId) {
    if (!confirm('Publish this timetable?')) return;

    try {
        await database.ref(`timetables/${classId}`).update({
            status: 'published',
            publishedAt: Date.now(),
            publishedBy: auth.currentUser.uid
        });

        showToast('Timetable published!', 'success');
        loadSavedTimetables();
    } catch (error) {
        showToast('Error: ' + error.message, 'danger');
    }
}

// Unpublish timetable
async function unpublishTimetable(classId) {
    if (!confirm('Unpublish this timetable? It will no longer be visible to users.')) return;

    try {
        await database.ref(`timetables/${classId}`).update({
            status: 'draft',
            updatedAt: Date.now()
        });

        showToast('Timetable unpublished', 'success');
        loadSavedTimetables();
    } catch (error) {
        showToast('Error: ' + error.message, 'danger');
    }
}

// ==================== TEACHER AVAILABILITY ====================

let currentAvailabilityTeacherId = null;
let currentUnavailableSlots = [];

// Open availability modal
async function openAvailabilityModal(teacherId) {
    currentAvailabilityTeacherId = teacherId;
    const teacher = teachersData[teacherId];

    if (!teacher) {
        showToast('Teacher not found', 'danger');
        return;
    }

    currentUnavailableSlots = [...(teacher.unavailableSlots || [])];

    document.getElementById('availabilityTeacherId').value = teacherId;

    // Build the availability grid
    await buildAvailabilityGrid();

    const modal = new bootstrap.Modal(document.getElementById('availabilityModal'));
    modal.show();
}

// Build availability grid
async function buildAvailabilityGrid() {
    const table = document.getElementById('availabilityGrid');
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');

    // Get periods from slots data
    const periods = [];
    const periodInfo = {};

    Object.values(slotsData).forEach(slot => {
        if (slot.type !== 'break' && !periods.includes(slot.period)) {
            periods.push(slot.period);
            periodInfo[slot.period] = {
                start: slot.start,
                end: slot.end
            };
        }
    });

    periods.sort((a, b) => a - b);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const shortDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    // Build header
    thead.innerHTML = '<th>Day / Period</th>';
    periods.forEach(p => {
        const info = periodInfo[p] || {};
        thead.innerHTML += `<th>P${p}<br><small>${info.start || ''}-${info.end || ''}</small></th>`;
    });

    // Build rows
    tbody.innerHTML = '';
    days.forEach((day, dayIndex) => {
        let row = `<tr><td><strong>${day}</strong></td>`;

        periods.forEach(period => {
            const slotId = `${shortDays[dayIndex]}-P${period}`;
            const isUnavailable = currentUnavailableSlots.includes(slotId);

            row += `
                <td class="availability-cell ${isUnavailable ? 'unavailable' : 'available'}"
                    data-slot="${slotId}"
                    onclick="toggleAvailability('${slotId}')"
                    style="cursor: pointer; ${isUnavailable ? 'background-color: #dc3545; color: white;' : 'background-color: #28a745; color: white;'}">
                    ${isUnavailable ? '<i class="bi bi-x"></i>' : '<i class="bi bi-check"></i>'}
                </td>
            `;
        });

        row += '</tr>';
        tbody.innerHTML += row;
    });
}

// Toggle slot availability
function toggleAvailability(slotId) {
    const cell = document.querySelector(`[data-slot="${slotId}"]`);

    if (currentUnavailableSlots.includes(slotId)) {
        // Make available
        currentUnavailableSlots = currentUnavailableSlots.filter(s => s !== slotId);
        cell.style.backgroundColor = '#28a745';
        cell.innerHTML = '<i class="bi bi-check"></i>';
        cell.classList.remove('unavailable');
        cell.classList.add('available');
    } else {
        // Make unavailable
        currentUnavailableSlots.push(slotId);
        cell.style.backgroundColor = '#dc3545';
        cell.innerHTML = '<i class="bi bi-x"></i>';
        cell.classList.remove('available');
        cell.classList.add('unavailable');
    }
}

// Save teacher availability
async function saveTeacherAvailability() {
    if (!currentAvailabilityTeacherId) {
        showToast('No teacher selected', 'danger');
        return;
    }

    try {
        await database.ref(`teachers/${currentAvailabilityTeacherId}`).update({
            unavailableSlots: currentUnavailableSlots
        });

        const modal = bootstrap.Modal.getInstance(document.getElementById('availabilityModal'));
        modal.hide();

        showToast('Availability updated successfully!', 'success');

        // Refresh teachers table
        await loadTeachers();
    } catch (error) {
        showToast('Error saving availability: ' + error.message, 'danger');
    }
}
