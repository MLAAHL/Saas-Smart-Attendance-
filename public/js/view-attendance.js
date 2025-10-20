// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let currentStream = '';
let currentSemester = '';
let currentSubject = '';
let currentViewMode = 'full';
let currentDate = '';
let registerData = null;
let isEditMode = false;
let originalData = null;
let currentDateData = null;
let selectedSessions = new Set(); // Track selected sessions for deletion

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 View Attendance initialized');
  
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
  
  await loadStreams();
  setupEventListeners();
  
  setTimeout(() => restoreState(), 500);
});

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

function saveState() {
  const streamSelect = document.getElementById('streamSelect');
  const semesterSelect = document.getElementById('semesterSelect');
  const subjectSelect = document.getElementById('subjectSelect');
  
  const state = {
    stream: streamSelect.value,
    semester: semesterSelect.value,
    subject: subjectSelect.value,
    timestamp: Date.now()
  };
  
  localStorage.setItem('attendanceViewState', JSON.stringify(state));
  console.log('💾 State saved:', state);
}

async function restoreState() {
  try {
    const savedState = localStorage.getItem('attendanceViewState');
    
    if (!savedState) {
      console.log('ℹ️ No saved state found');
      return;
    }
    
    const state = JSON.parse(savedState);
    console.log('📥 Restoring state:', state);
    
    if (!state.stream || !state.semester || !state.subject) {
      console.log('⚠️ Incomplete state data');
      return;
    }
    
    const streamSelect = document.getElementById('streamSelect');
    const semesterSelect = document.getElementById('semesterSelect');
    const subjectSelect = document.getElementById('subjectSelect');
    
    streamSelect.value = state.stream;
    currentStream = state.stream;
    
    await loadSemesters(state.stream);
    await sleep(150);
    semesterSelect.value = state.semester;
    currentSemester = state.semester;
    
    await loadSubjects(state.stream, state.semester);
    await sleep(150);
    subjectSelect.value = state.subject;
    currentSubject = state.subject;
    
    console.log('✅ State restored successfully');
    await sleep(200);
    loadRegister();
    
  } catch (error) {
    console.error('❌ Error restoring state:', error);
    localStorage.removeItem('attendanceViewState');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// LOAD FUNCTIONS
// ============================================================================

async function loadStreams() {
  const streamSelect = document.getElementById('streamSelect');
  
  try {
    streamSelect.innerHTML = '<option value="">Loading...</option>';
    
    console.log('📡 Fetching streams from database...');
    
    const response = await fetch('/api/streams');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('📦 Streams API response:', data);
    
    streamSelect.innerHTML = '<option value="">-- Select Stream --</option>';
    
    if (data.success && Array.isArray(data.streams)) {
      data.streams.forEach(stream => {
        const option = document.createElement('option');
        
        if (typeof stream === 'string') {
          option.value = stream;
          option.textContent = stream.toUpperCase();
        } else {
          option.value = stream.streamCode || stream.name || stream;
          option.textContent = stream.fullName || stream.name || stream;
        }
        
        streamSelect.appendChild(option);
      });
      console.log(`✅ Loaded ${data.streams.length} streams from database`);
    } 
    else if (Array.isArray(data)) {
      data.forEach(stream => {
        const option = document.createElement('option');
        if (typeof stream === 'string') {
          option.value = stream;
          option.textContent = stream.toUpperCase();
        } else {
          option.value = stream.streamCode || stream.name;
          option.textContent = stream.fullName || stream.name;
        }
        streamSelect.appendChild(option);
      });
      console.log(`✅ Loaded ${data.length} streams from database`);
    }
    else {
      throw new Error('Invalid streams data format');
    }
    
  } catch (error) {
    console.error('❌ Error loading streams from database:', error);
    console.warn('⚠️ Using fallback: No streams available');
    
    streamSelect.innerHTML = '<option value="">-- No Streams Available --</option>';
    
    alert('⚠️ Could not load streams from database. Please contact administrator.');
  }
}

async function loadSemesters(stream) {
  const semesterSelect = document.getElementById('semesterSelect');
  const subjectSelect = document.getElementById('subjectSelect');
  
  try {
    semesterSelect.innerHTML = '<option value="">Loading...</option>';
    subjectSelect.innerHTML = '<option value="">Select subject</option>';
    subjectSelect.disabled = true;
    
    if (!stream) {
      semesterSelect.innerHTML = '<option value="">Select semester</option>';
      return;
    }
    
    console.log('📡 Fetching semesters for stream:', stream);
    
    const response = await fetch(`/api/students/semesters/${encodeURIComponent(stream)}`);
    
    if (!response.ok) {
      console.warn('⚠️ Semesters API failed, using fallback');
      throw new Error('Failed to fetch semesters');
    }
    
    const data = await response.json();
    
    console.log('📦 Semesters API response:', data);
    
    semesterSelect.innerHTML = '<option value="">Select semester</option>';
    
    if (data.success && data.semesters && Array.isArray(data.semesters)) {
      if (data.semesters.length === 0) {
        console.warn('⚠️ No semesters found for stream:', stream);
        throw new Error('No semesters found');
      }
      
      data.semesters.forEach(sem => {
        const option = document.createElement('option');
        option.value = sem;
        option.textContent = `Semester ${sem}`;
        semesterSelect.appendChild(option);
      });
      console.log('✅ Semesters loaded:', data.semesters);
    } else {
      throw new Error('Invalid semesters data format');
    }
    
  } catch (error) {
    console.warn('⚠️ Using fallback semesters:', error.message);
    
    semesterSelect.innerHTML = '<option value="">Select semester</option>';
    for (let i = 1; i <= 6; i++) {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `Semester ${i}`;
      semesterSelect.appendChild(option);
    }
    console.log('✅ Loaded fallback semesters (1-6)');
  }
}

async function loadSubjects(stream, semester) {
  const subjectSelect = document.getElementById('subjectSelect');
  
  try {
    subjectSelect.innerHTML = '<option value="">Loading...</option>';
    subjectSelect.disabled = true;
    
    if (!stream || !semester) {
      subjectSelect.innerHTML = '<option value="">Select stream & semester first</option>';
      return;
    }
    
    console.log('📡 Fetching subjects for:', { stream, semester });
    
    const response = await fetch(`/api/subjects/${encodeURIComponent(stream)}/sem${semester}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('📦 Subjects API response:', data);
    
    subjectSelect.innerHTML = '<option value="">Select subject</option>';
    
    if (data.success && data.subjects && Array.isArray(data.subjects)) {
      if (data.subjects.length === 0) {
        subjectSelect.innerHTML = '<option value="">No subjects found</option>';
        console.warn('⚠️ No subjects found for:', { stream, semester });
        return;
      }
      
      data.subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject.name || subject.subjectName;
        option.textContent = subject.name || subject.subjectName;
        subjectSelect.appendChild(option);
      });
      
      subjectSelect.disabled = false;
      console.log(`✅ Loaded ${data.subjects.length} subjects`);
    } else {
      throw new Error('Invalid subjects data format');
    }
    
  } catch (error) {
    console.error('❌ Error loading subjects:', error);
    subjectSelect.innerHTML = '<option value="">No subjects found</option>';
    subjectSelect.disabled = true;
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  const streamSelect = document.getElementById('streamSelect');
  const semesterSelect = document.getElementById('semesterSelect');
  const subjectSelect = document.getElementById('subjectSelect');
  const loadRegisterBtn = document.getElementById('loadRegisterBtn');
  const registerTable = document.getElementById('registerTable');
  const fullRegisterBtn = document.getElementById('fullRegisterBtn');
  const singleDateBtn = document.getElementById('singleDateBtn');
  const specificDateInput = document.getElementById('specificDateInput');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  const studentSearchInput = document.getElementById('studentSearchInput');
  const attendanceStats = document.getElementById('attendanceStats');
  
  streamSelect.addEventListener('change', async () => {
    const stream = streamSelect.value;
    currentStream = stream;
    await loadSemesters(stream);
    registerTable.classList.add('hidden');
    if (attendanceStats) {
      attendanceStats.classList.add('hidden');
    }
    saveState();
  });
  
  semesterSelect.addEventListener('change', async () => {
    const stream = streamSelect.value;
    const semester = semesterSelect.value;
    currentSemester = semester;
    await loadSubjects(stream, semester);
    registerTable.classList.add('hidden');
    if (attendanceStats) {
      attendanceStats.classList.add('hidden');
    }
    saveState();
  });
  
  subjectSelect.addEventListener('change', () => {
    currentSubject = subjectSelect.value;
    saveState();
  });
  
  loadRegisterBtn.addEventListener('click', loadRegister);
  fullRegisterBtn.addEventListener('click', () => switchViewMode('full'));
  
  singleDateBtn.addEventListener('click', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayFormatted = `${yyyy}-${mm}-${dd}`;
    
    specificDateInput.value = todayFormatted;
    switchViewMode('single');
  });
  
  specificDateInput.addEventListener('change', () => {
    if (currentViewMode === 'single' && specificDateInput.value) {
      loadSingleDateView();
    }
  });
  
  editAttendanceBtn.addEventListener('click', enableEditMode);
  saveAttendanceBtn.addEventListener('click', saveAttendance);
  cancelEditBtn.addEventListener('click', cancelEdit);
  deleteAttendanceBtn.addEventListener('click', deleteAttendance);
  
  if (deleteSessionBtn) {
    deleteSessionBtn.addEventListener('click', deleteSelectedSessions);
  }
  
  if (studentSearchInput) {
    studentSearchInput.addEventListener('input', performSearch);
  }
}

// ============================================================================
// REST OF YOUR CODE (Continue from loadRegister function onwards...)
// ============================================================================

// ============================================================================
// LOAD REGISTER
// ============================================================================

async function loadRegister() {
  const streamSelect = document.getElementById('streamSelect');
  const semesterSelect = document.getElementById('semesterSelect');
  const subjectSelect = document.getElementById('subjectSelect');
  const registerTable = document.getElementById('registerTable');
  const searchContainer = document.getElementById('searchContainer');
  
  const stream = streamSelect.value;
  const semester = semesterSelect.value;
  const subject = subjectSelect.value;
  
  if (!stream || !semester || !subject) {
    alert('Please select stream, semester, and subject');
    return;
  }
  
  currentStream = stream;
  currentSemester = semester;
  currentSubject = subject;
  
  saveState();
  
  try {
    showLoadingState();
    
    const response = await fetch(`/api/attendance/register/${stream}/sem${semester}/${encodeURIComponent(subject)}`);
    const data = await response.json();
    
    console.log('📦 Register data received:', data);
    
    if (data.success) {
      registerData = data;
      registerTable.classList.remove('hidden');
      
      currentViewMode = 'full';
      switchViewMode('full');
      
      updateStats();
      
      if (searchContainer) {
        searchContainer.classList.remove('hidden');
      }
    } else {
      alert('Failed to load register: ' + data.error);
    }
  } catch (error) {
    console.error('❌ Error loading register:', error);
    alert('Error loading register: ' + error.message);
  }
}

// ============================================================================
// LOAD SINGLE DATE VIEW
// ============================================================================

async function loadSingleDateView() {
  const specificDateInput = document.getElementById('specificDateInput');
  const viewThead = document.getElementById('view-thead');
  const viewTbody = document.getElementById('view-tbody');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  
  const selectedDate = specificDateInput.value;
  
  if (!selectedDate) {
    alert('Please select a date');
    return;
  }
  
  if (!currentStream || !currentSemester || !currentSubject) {
    alert('Please load register first');
    return;
  }
  
  currentDate = selectedDate;
  
  try {
    showLoadingState();
    
    const response = await fetch(`/api/attendance/date/${currentStream}/sem${currentSemester}/${encodeURIComponent(currentSubject)}/${selectedDate}`);
    const data = await response.json();
    
    console.log('📅 Single date data:', data);
    
    if (data.success && data.sessions && data.sessions.length > 0) {
      currentDateData = data;
      displaySingleDate(data);
      
      editAttendanceBtn.classList.remove('hidden');
      deleteAttendanceBtn.classList.remove('hidden');
      exportExcelBtn.classList.add('hidden');
    } else {
      viewThead.innerHTML = '';
      viewTbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 60px;">
            <i class="material-icons-round" style="font-size: 48px; color: #9CA3AF; display: block; margin-bottom: 16px;">event_busy</i>
            <p style="color: #6b7280; font-size: 14px;">No attendance records found for ${selectedDate}</p>
          </td>
        </tr>
      `;
      
      editAttendanceBtn.classList.add('hidden');
      deleteAttendanceBtn.classList.add('hidden');
      exportExcelBtn.classList.add('hidden');
      currentDateData = null;
    }
    
  } catch (error) {
    console.error('❌ Error loading single date:', error);
    alert('Error loading date: ' + error.message);
  }
}

// ============================================================================
// VIEW MODES
// ============================================================================

function switchViewMode(mode) {
  const fullRegisterBtn = document.getElementById('fullRegisterBtn');
  const singleDateBtn = document.getElementById('singleDateBtn');
  const dateSelector = document.getElementById('dateSelector');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  
  currentViewMode = mode;
  
  if (isEditMode) {
    cancelEdit();
  }
  selectedSessions.clear();
  
  if (mode === 'full') {
    fullRegisterBtn.classList.add('active');
    singleDateBtn.classList.remove('active');
    dateSelector.classList.add('hidden');
    deleteAttendanceBtn.classList.add('hidden');
    deleteSessionBtn.classList.add('hidden');
    saveAttendanceBtn.classList.add('hidden');
    cancelEditBtn.classList.add('hidden');
    
    if (registerData) {
      displayFullRegister();
      exportExcelBtn.classList.remove('hidden');
      editAttendanceBtn.classList.remove('hidden');
    }
  } else {
    fullRegisterBtn.classList.remove('active');
    singleDateBtn.classList.add('active');
    dateSelector.classList.remove('hidden');
    deleteSessionBtn.classList.add('hidden');
    exportExcelBtn.classList.add('hidden');
    
    if (registerData) {
      loadSingleDateView();
    }
  }
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function displayFullRegister() {
  if (!registerData) return;
  
  const viewThead = document.getElementById('view-thead');
  const viewTbody = document.getElementById('view-tbody');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const searchContainer = document.getElementById('searchContainer');
  
  selectedSessions.clear();
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  if (deleteSessionBtn) {
    deleteSessionBtn.classList.add('hidden');
  }
  
  let headerHTML = '<tr>';
  headerHTML += '<th>#</th>';
  headerHTML += '<th>Student ID</th>';
  headerHTML += '<th>Name</th>';
  
  registerData.sessions.forEach((session, index) => {
    const date = new Date(session.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
    headerHTML += `
      <th class="session-header" data-session-id="${session._id}" data-session-index="${index}" style="text-align: center;">
        <div>
          <span class="session-header-checkbox"></span>
          <div class="time-badge">${session.time}</div>
          <div style="font-size: 10px; margin-top: 4px; font-weight: 500; color: #6b7280;">${date}</div>
        </div>
      </th>
    `;
  });
  
  headerHTML += '<th style="text-align: center;">Present</th>';
  headerHTML += '<th style="text-align: center;">Absent</th>';
  headerHTML += '<th style="text-align: center;">%</th>';
  headerHTML += '</tr>';
  
  viewThead.innerHTML = headerHTML;
  
  const sessionHeaders = viewThead.querySelectorAll('.session-header');
  sessionHeaders.forEach(header => {
    header.addEventListener('click', () => toggleSessionSelection(header));
  });
  
  let bodyHTML = '';
  registerData.students.forEach((student, index) => {
    bodyHTML += '<tr>';
    bodyHTML += `<td>${index + 1}</td>`;
    bodyHTML += `<td style="font-family: monospace;">${student.studentID}</td>`;
    bodyHTML += `<td>${student.name}</td>`;
    
    student.attendance.forEach((att, attIndex) => {
      const chipClass = att.status === 'P' ? 'chip-present' : 'chip-absent';
      const sessionId = att.sessionId || registerData.sessions[attIndex]?._id || '';
      
      bodyHTML += `
        <td style="text-align: center;">
          <span class="status-chip ${chipClass}"
                data-student="${student.studentID}"
                data-session="${sessionId}">${att.status}</span>
        </td>
      `;
    });
    
    bodyHTML += `<td style="text-align: center; font-weight: 700; color: #22C55E">${student.presentCount}</td>`;
    bodyHTML += `<td style="text-align: center; font-weight: 700; color: #EF4444">${student.absentCount}</td>`;
    bodyHTML += `<td style="text-align: center; font-weight: 700; color: #6366F1">${student.attendancePercentage}%</td>`;
    bodyHTML += '</tr>';
  });
  
  viewTbody.innerHTML = bodyHTML;
  exportExcelBtn.classList.remove('hidden');
  editAttendanceBtn.classList.remove('hidden');
  
  if (searchContainer) {
    searchContainer.classList.remove('hidden');
  }
  
  updateStats();
}

function toggleSessionSelection(headerElement) {
  const sessionId = headerElement.dataset.sessionId;
  
  if (selectedSessions.has(sessionId)) {
    selectedSessions.delete(sessionId);
    headerElement.classList.remove('selected');
  } else {
    selectedSessions.add(sessionId);
    headerElement.classList.add('selected');
  }
  
  console.log('📌 Selected sessions:', Array.from(selectedSessions));
  
  const deleteSessionBtn = document.getElementById('deleteSessionBtn');
  if (selectedSessions.size > 0) {
    deleteSessionBtn.classList.remove('hidden');
  } else {
    deleteSessionBtn.classList.add('hidden');
  }
}

async function deleteSelectedSessions() {
  if (selectedSessions.size === 0) {
    alert('⚠️ Please select sessions to delete by clicking on the session headers');
    return;
  }
  
  const sessionCount = selectedSessions.size;
  const confirmMsg = `🗑️ Are you sure you want to delete ${sessionCount} session${sessionCount > 1 ? 's' : ''}?\n\nThis will permanently remove attendance data for all students in ${sessionCount > 1 ? 'these sessions' : 'this session'}.`;
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  try {
    console.log('🗑️ Deleting sessions:', Array.from(selectedSessions));
    
    const deleteSessionBtn = document.getElementById('deleteSessionBtn');
    const originalText = deleteSessionBtn.innerHTML;
    deleteSessionBtn.disabled = true;
    deleteSessionBtn.innerHTML = '<i class="material-icons-round">hourglass_empty</i> Deleting...';
    
    const deletePromises = Array.from(selectedSessions).map(sessionId =>
      fetch(`/api/attendance/${sessionId}`, { 
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })
    );
    
    const results = await Promise.all(deletePromises);
    const successCount = results.filter(r => r.ok).length;
    const failCount = results.length - successCount;
    
    if (failCount === 0) {
      alert(`✅ Successfully deleted ${successCount} session${successCount > 1 ? 's' : ''}!`);
      
      selectedSessions.clear();
      deleteSessionBtn.classList.add('hidden');
      await loadRegister();
    } else {
      alert(`⚠️ Deleted ${successCount} sessions successfully.\n${failCount} session${failCount > 1 ? 's' : ''} failed to delete.`);
      selectedSessions.clear();
      await loadRegister();
    }
    
  } catch (error) {
    console.error('❌ Error deleting sessions:', error);
    alert('❌ Error deleting sessions: ' + error.message);
    
    const deleteSessionBtn = document.getElementById('deleteSessionBtn');
    deleteSessionBtn.disabled = false;
    deleteSessionBtn.innerHTML = '<i class="material-icons-round">delete_sweep</i> Delete Sessions';
  }
}

function displaySingleDate(data) {
  const viewThead = document.getElementById('view-thead');
  const viewTbody = document.getElementById('view-tbody');
  
  let headerHTML = '<tr>';
  headerHTML += '<th>#</th>';
  headerHTML += '<th>Student ID</th>';
  headerHTML += '<th>Name</th>';
  
  data.sessions.forEach(session => {
    headerHTML += `
      <th style="text-align: center;">
        <div class="time-badge">${session.time}</div>
      </th>
    `;
  });
  
  headerHTML += '</tr>';
  viewThead.innerHTML = headerHTML;
  
  let bodyHTML = '';
  data.students.forEach((student, index) => {
    bodyHTML += '<tr>';
    bodyHTML += `<td>${index + 1}</td>`;
    bodyHTML += `<td style="font-family: monospace;">${student.studentID}</td>`;
    bodyHTML += `<td>${student.name}</td>`;
    
    student.sessions.forEach(session => {
      const chipClass = session.status === 'P' ? 'chip-present' : 'chip-absent';
      bodyHTML += `
        <td style="text-align: center;">
          <span class="status-chip ${chipClass}" 
                data-student="${student.studentID}" 
                data-session="${session.sessionId}">${session.status}</span>
        </td>
      `;
    });
    
    bodyHTML += '</tr>';
  });
  
  viewTbody.innerHTML = bodyHTML;
}

// ============================================================================
// STATISTICS
// ============================================================================

function updateStats() {
  if (!registerData) {
    console.warn('⚠️ No register data available');
    return;
  }
  
  const attendanceStats = document.getElementById('attendanceStats');
  const totalSessionsEl = document.getElementById('totalSessions');
  const totalStudentsEl = document.getElementById('totalStudents');
  
  if (!attendanceStats || !totalSessionsEl || !totalStudentsEl) {
    console.error('❌ Stats elements not found');
    return;
  }
  
  const totalSessions = registerData.totalSessions || 0;
  const totalStudents = registerData.totalStudents || 0;
  
  console.log('📊 Stats values:', { totalSessions, totalStudents });
  
  totalSessionsEl.textContent = totalSessions;
  totalStudentsEl.textContent = totalStudents;
  
  attendanceStats.classList.remove('hidden');
  
  console.log('✅ Stats updated successfully');
}

// ============================================================================
// SEARCH FUNCTIONALITY
// ============================================================================

function performSearch() {
  const studentSearchInput = document.getElementById('studentSearchInput');
  const searchStats = document.getElementById('searchStats');
  const viewTbody = document.getElementById('view-tbody');
  
  const searchTerm = studentSearchInput.value.toLowerCase().trim();
  
  const rows = viewTbody.querySelectorAll('tr');
  let visibleCount = 0;
  
  rows.forEach(row => {
    const studentID = row.querySelector('td:nth-child(2)')?.textContent.toLowerCase() || '';
    const studentName = row.querySelector('td:nth-child(3)')?.textContent.toLowerCase() || '';
    
    if (studentID.includes(searchTerm) || studentName.includes(searchTerm)) {
      row.style.display = '';
      visibleCount++;
    } else {
      row.style.display = 'none';
    }
  });
  
  if (searchStats) {
    searchStats.innerHTML = searchTerm 
      ? `<i class="material-icons-round" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">info</i>Showing ${visibleCount} of ${rows.length} students`
      : '';
  }
}

// ============================================================================
// EDIT FUNCTIONALITY
// ============================================================================

function enableEditMode() {
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const viewTbody = document.getElementById('view-tbody');
  
  if (!registerData && !currentDateData) {
    alert('Please load attendance data first');
    return;
  }
  
  isEditMode = true;
  originalData = viewTbody.innerHTML;
  
  const statusChips = viewTbody.querySelectorAll('.status-chip');
  
  console.log(`✏️ Found ${statusChips.length} status chips to convert`);
  
  statusChips.forEach((chip, index) => {
    const isPresent = chip.textContent.trim() === 'P';
    const studentId = chip.dataset.student;
    const sessionId = chip.dataset.session;
    
    if (!studentId || !sessionId) {
      console.warn(`⚠️ Chip ${index} missing data attributes:`, { studentId, sessionId });
      return;
    }
    
    const td = chip.parentElement;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isPresent;
    checkbox.className = 'edit-checkbox';
    checkbox.dataset.student = studentId;
    checkbox.dataset.session = sessionId;
    checkbox.style.cssText = `
      width: 20px;
      height: 20px;
      cursor: pointer;
      accent-color: var(--primary);
      transform: scale(1.2);
    `;
    
    td.innerHTML = '';
    td.appendChild(checkbox);
  });
  
  editAttendanceBtn.classList.add('hidden');
  deleteAttendanceBtn.classList.add('hidden');
  saveAttendanceBtn.classList.remove('hidden');
  cancelEditBtn.classList.remove('hidden');
  
  console.log('✅ Edit mode enabled with checkboxes');
}

async function saveAttendance() {
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const viewTbody = document.getElementById('view-tbody');
  
  if (!isEditMode) {
    alert('Not in edit mode');
    return;
  }
  
  try {
    const checkboxes = Array.from(viewTbody.querySelectorAll('.edit-checkbox'));
    
    if (checkboxes.length === 0) {
      alert('No attendance data to save');
      return;
    }
    
    console.log('💾 Saving attendance changes...');
    console.log('📊 Total checkboxes:', checkboxes.length);
    
    if (currentViewMode === 'single' && currentDateData) {
      console.log('📅 Single date mode - preparing bulk update');
      
      const updates = [];
      
      currentDateData.sessions.forEach(session => {
        const studentsPresent = [];
        const sessionCheckboxes = checkboxes.filter(cb => cb.dataset.session === session._id);
        
        sessionCheckboxes.forEach(checkbox => {
          if (checkbox.checked) {
            studentsPresent.push(checkbox.dataset.student);
          }
        });
        
        updates.push({
          sessionId: session._id,
          studentsPresent,
          totalStudents: currentDateData.students.length
        });
        
        console.log(`📝 Session ${session.time}: ${studentsPresent.length}/${currentDateData.students.length} present`);
      });
      
      console.log('🚀 Sending bulk update request...');
      
      const response = await fetch(`/api/attendance/bulk/${currentStream}/sem${currentSemester}/${encodeURIComponent(currentSubject)}/${currentDate}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Successfully updated ${result.modified} record(s)`);
        
        isEditMode = false;
        saveAttendanceBtn.classList.add('hidden');
        cancelEditBtn.classList.add('hidden');
        editAttendanceBtn.classList.remove('hidden');
        deleteAttendanceBtn.classList.remove('hidden');
        
        await loadSingleDateView();
      } else {
        alert('❌ Failed to update: ' + result.error);
      }
    }
    else if (currentViewMode === 'full' && registerData) {
      console.log('📚 Full register mode - preparing session updates');
      
      const sessionUpdates = new Map();
      
      checkboxes.forEach(checkbox => {
        const sessionId = checkbox.dataset.session;
        const studentId = checkbox.dataset.student;
        const isPresent = checkbox.checked;
        
        if (!sessionId || !studentId) {
          console.warn('⚠️ Checkbox missing data:', { sessionId, studentId });
          return;
        }
        
        if (!sessionUpdates.has(sessionId)) {
          sessionUpdates.set(sessionId, {
            sessionId,
            studentsPresent: [],
            totalStudents: registerData.totalStudents
          });
        }
        
        if (isPresent) {
          sessionUpdates.get(sessionId).studentsPresent.push(studentId);
        }
      });
      
      console.log(`🚀 Updating ${sessionUpdates.size} sessions...`);
      
      const updatePromises = Array.from(sessionUpdates.values()).map(update => {
        console.log(`📝 Updating session ${update.sessionId}: ${update.studentsPresent.length}/${update.totalStudents} present`);
        
        return fetch(`/api/attendance/session/${update.sessionId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            studentsPresent: update.studentsPresent,
            totalStudents: update.totalStudents
          })
        });
      });
      
      const results = await Promise.all(updatePromises);
      const successCount = results.filter(r => r.ok).length;
      const failCount = results.length - successCount;
      
      if (failCount === 0) {
        alert(`✅ Successfully updated ${successCount} session(s)`);
        
        isEditMode = false;
        saveAttendanceBtn.classList.add('hidden');
        cancelEditBtn.classList.add('hidden');
        editAttendanceBtn.classList.remove('hidden');
        
        await loadRegister();
      } else {
        alert(`⚠️ Updated ${successCount} sessions, ${failCount} failed`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error saving attendance:', error);
    alert('Error saving attendance: ' + error.message);
  }
}

function cancelEdit() {
  const viewTbody = document.getElementById('view-tbody');
  const editAttendanceBtn = document.getElementById('editAttendanceBtn');
  const deleteAttendanceBtn = document.getElementById('deleteAttendanceBtn');
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  
  viewTbody.innerHTML = originalData;
  isEditMode = false;
  
  editAttendanceBtn.classList.remove('hidden');
  
  if (currentViewMode === 'single' && currentDateData) {
    deleteAttendanceBtn.classList.remove('hidden');
  } else {
    deleteAttendanceBtn.classList.add('hidden');
  }
  
  saveAttendanceBtn.classList.add('hidden');
  cancelEditBtn.classList.add('hidden');
  
  console.log('❌ Edit cancelled');
}

async function deleteAttendance() {
  const specificDateInput = document.getElementById('specificDateInput');
  const viewTbody = document.getElementById('view-tbody');
  
  if (!currentDateData) {
    alert('Please select a date first');
    return;
  }
  
  if (!confirm(`Delete ${currentDateData.sessions.length} record(s) for ${currentDate}?`)) {
    return;
  }
  
  try {
    const deletePromises = currentDateData.sessions.map(session =>
      fetch(`/api/attendance/${session._id}`, { method: 'DELETE' })
    );
    
    const results = await Promise.all(deletePromises);
    const allSuccess = results.every(r => r.ok);
    
    if (allSuccess) {
      alert('✅ Records deleted successfully');
      
      currentDateData = null;
      specificDateInput.value = '';
      viewTbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 60px;">
            <i class="material-icons-round" style="font-size: 48px; color: #22C55E; display: block; margin-bottom: 16px;">check_circle</i>
            <p style="color: #6b7280; font-size: 14px;">Records deleted successfully</p>
          </td>
        </tr>
      `;
      
      if (registerData) {
        await loadRegister();
      }
    } else {
      alert('❌ Failed to delete some records');
    }
    
  } catch (error) {
    console.error('❌ Error deleting:', error);
    alert('Error deleting attendance');
  }
}

// ============================================================================
// EXPORT TO EXCEL
// ============================================================================

function exportToExcel() {
  if (!registerData) return;
  
  const wb = XLSX.utils.book_new();
  const data = [];
  
  const header = ['#', 'Student ID', 'Name'];
  registerData.sessions.forEach(session => {
    const date = new Date(session.date).toLocaleDateString('en-GB');
    header.push(`${date} ${session.time}`);
  });
  header.push('Present', 'Absent', 'Percentage');
  data.push(header);
  
  registerData.students.forEach((student, index) => {
    const row = [index + 1, student.studentID, student.name];
    student.attendance.forEach(att => row.push(att.status));
    row.push(student.presentCount, student.absentCount, student.attendancePercentage + '%');
    data.push(row);
  });
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  
  const filename = `Attendance_${currentStream}_Sem${currentSemester}_${currentSubject}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
  
  console.log('📊 Exported:', filename);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showLoadingState() {
  const viewTbody = document.getElementById('view-tbody');
  viewTbody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align: center; padding: 60px;">
        <div class="modern-spinner" style="margin: 0 auto 16px;"></div>
        <p style="color: #6b7280; font-size: 14px;">Loading data...</p>
      </td>
    </tr>
  `;
}

function showButtons() {
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  exportExcelBtn.classList.remove('hidden');
}
