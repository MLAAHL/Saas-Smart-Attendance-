// ============================================================================
// MYCLASS.JS - COMPLETE DATABASE SYNC (FIXED)
// ============================================================================

// ============================================================================
// ACCESS FIREBASE FROM WINDOW (exported from HTML)
// ============================================================================

// Wait for Firebase to be available
const getFirebaseAuth = () => window.firebaseAuth;
const getOnAuthStateChanged = () => window.firebaseOnAuthStateChanged;
const getSignOut = () => window.firebaseSignOut;

// Check Firebase availability
if (!window.firebaseAuth) {
  console.error('❌ Firebase not loaded yet! Make sure HTML loads Firebase first.');
} else {
  console.log('✅ Firebase available in myclass.js');
}

// Global variables
let attendanceQueue = [];
let createdSubjects = [];
let completedClasses = [];
let selectedStreamData = null;
let createSelectedStreamData = null;
let currentSection = 'todaySection';
let streams = [];
let userData = {
  userName: 'Teacher',
  userEmail: null,
  firebaseUid: null
};

// API base URL
const API_BASE_URL = '/api';

// DOM Elements
const elements = {
  queueList: document.getElementById('queueList'),
  queueCount: document.getElementById('queueCount'),
  emptyQueuePrompt: document.getElementById('emptyQueuePrompt'),
  subjectsList: document.getElementById('subjectsList'),
  emptySubjectsPrompt: document.getElementById('emptySubjectsPrompt'),
  completedList: document.getElementById('completedList'),
  completedCount: document.getElementById('completedCount'),
  emptyCompletedPrompt: document.getElementById('emptyCompletedPrompt'),
  createStreamContainer: document.getElementById('createStreamContainer'),
  createSemester: document.getElementById('createSemester'),
  createSubject: document.getElementById('createSubject'),
  createSubjectForm: document.getElementById('createSubjectForm'),
  createSubjectPage: document.getElementById('createSubjectPage'),
  todaySection: document.getElementById('todaySection'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail')
};

// ============================================================================
// FETCH STREAMS FROM DATABASE
// ============================================================================

async function fetchStreamsFromDatabase() {
  try {
    console.log('📚 Fetching streams from database...');
    
    const response = await fetch(`${API_BASE_URL}/students/streams`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 Streams API response:', data);

    if (data.success && Array.isArray(data.streams)) {
      streams = data.streams.map(streamName => ({
        name: streamName,
        displayName: streamName,
        icon: getIconForStream(streamName),
        color: "var(--primary)",
        luxeColor: "var(--primary)"
      }));

      console.log(`✅ Loaded ${streams.length} streams:`, streams);
      populateStreamDropdowns();
      return streams;
    } else {
      throw new Error('Invalid streams response format');
    }
  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    showNotification('Failed to load streams', 'error');
    streams = [];
    return streams;
  }
}

// Get icon for stream
function getIconForStream(streamName) {
  const iconMap = {
    'BCA': 'fa-laptop-code',
    'BCA AI & ML': 'fa-brain',
    'BBA': 'fa-chart-line',
    'BCOM': 'fa-money-bill-wave',
    'BCom': 'fa-money-bill-wave',
    'BDA': 'fa-chart-bar',
    'BCom-BDA': 'fa-chart-bar',
    'BCom A and F': 'fa-calculator',
    'A & F': 'fa-calculator',
    'BCOM SECTION B': 'fa-users',
    'BCOM SECTION C': 'fa-user-graduate'
  };
  return iconMap[streamName] || 'fa-graduation-cap';
}

// Populate stream dropdowns
function populateStreamDropdowns() {
  if (!elements.createStreamContainer) return;
  
  elements.createStreamContainer.innerHTML = '<option value="">Select stream</option>';
  
  streams.forEach(stream => {
    const option = document.createElement('option');
    option.value = stream.name;
    option.textContent = stream.displayName || stream.name;
    elements.createStreamContainer.appendChild(option);
  });
  
  console.log('✅ Stream dropdowns populated');
}

// ============================================================================
// LOAD SUBJECTS FROM DATABASE
// ============================================================================

async function loadSubjectsForCreation(stream, semester) {
  try {
    console.log(`📚 Loading subjects for ${stream} Sem ${semester}...`);
    
    elements.createSubject.innerHTML = '<option value="">Loading...</option>';
    elements.createSubject.disabled = true;
    
    const response = await fetch(`${API_BASE_URL}/subjects/${encodeURIComponent(stream)}/sem${semester}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    console.log('📦 Subjects response:', data);
    
    const subjects = data.subjects || [];
    
    if (subjects.length === 0) {
      elements.createSubject.innerHTML = '<option value="">No subjects found</option>';
      showNotification('No subjects available', 'warning');
      return;
    }
    
    elements.createSubject.innerHTML = '<option value="">Select subject</option>';
    subjects.forEach(subject => {
      const option = document.createElement('option');
      const subjectName = subject.name || subject.subjectName;
      option.value = subjectName;
      option.textContent = subjectName;
      
      if (subject.subjectType === 'LANGUAGE' && subject.languageType) {
        option.textContent += ` (${subject.languageType})`;
      }
      
      elements.createSubject.appendChild(option);
    });
    
    elements.createSubject.disabled = false;
    console.log(`✅ Loaded ${subjects.length} subjects`);
    
  } catch (error) {
    console.error('❌ Error loading subjects:', error);
    elements.createSubject.innerHTML = '<option value="">Error loading subjects</option>';
    showNotification('Failed to load subjects', 'error');
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Stream selection change
if (elements.createStreamContainer) {
  elements.createStreamContainer.addEventListener('change', function() {
    const streamName = this.value;
    const semester = elements.createSemester?.value;
    
    if (streamName) {
      createSelectedStreamData = streams.find(s => s.name === streamName);
      console.log('Selected stream:', createSelectedStreamData);
      
      if (semester) {
        loadSubjectsForCreation(streamName, semester);
      }
    } else {
      createSelectedStreamData = null;
      elements.createSubject.innerHTML = '<option value="">Select stream first</option>';
      elements.createSubject.disabled = true;
    }
  });
}

// Semester selection change
if (elements.createSemester) {
  elements.createSemester.addEventListener('change', function() {
    const semester = this.value;
    const streamName = createSelectedStreamData?.name;
    
    if (semester && streamName) {
      loadSubjectsForCreation(streamName, semester);
    } else {
      elements.createSubject.innerHTML = '<option value="">Select stream & semester first</option>';
      elements.createSubject.disabled = true;
    }
  });
}

// Create subject form submission
if (elements.createSubjectForm) {
  elements.createSubjectForm.addEventListener('submit', handleCreateSubject);
}

// ============================================================================
// HANDLE CREATE SUBJECT
// ============================================================================

async function handleCreateSubject(e) {
  e.preventDefault();
  
  const stream = createSelectedStreamData?.name;
  const semester = elements.createSemester?.value;
  const subject = elements.createSubject?.value;
  
  if (!stream || !semester || !subject) {
    showNotification('Please fill all fields', 'error');
    return;
  }
  
  if (!userData.userEmail) {
    showNotification('User not authenticated', 'error');
    return;
  }
  
  const exists = createdSubjects.some(s => 
    s.stream === stream && 
    s.semester === parseInt(semester) && 
    s.subject === subject
  );
  
  if (exists) {
    showNotification('Subject already added', 'warning');
    return;
  }
  
  const subjectData = {
    id: Date.now().toString(),
    stream,
    semester: parseInt(semester),
    subject,
    createdAt: new Date().toISOString(),
    teacherEmail: userData.userEmail
  };
  
  try {
    await saveSubjectToDatabase(subjectData);
    await loadAllData();
    updateSubjectsDisplay();
    cancelCreateSubject();
    showNotification('Subject created successfully', 'success');
    console.log('✅ Subject created:', subjectData);
  } catch (error) {
    console.error('Failed to save subject:', error);
    showNotification('Failed to create subject', 'error');
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function saveSubjectToDatabase(subjectData) {
  try {
    console.log('💾 Saving subject to database...');
    
    const response = await fetch(`${API_BASE_URL}/teacher/subjects`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        teacherEmail: userData.userEmail,
        subject: subjectData
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Subject saved to database:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Database save failed:', error);
    throw error;
  }
}

async function loadSubjectsFromDatabase() {
  try {
    if (!userData.userEmail) {
      console.log('⚠️ User email not available');
      createdSubjects = [];
      return;
    }
    
    console.log('📥 Loading subjects from database for:', userData.userEmail);
    
    const response = await fetch(
      `${API_BASE_URL}/teacher/subjects?email=${encodeURIComponent(userData.userEmail)}`,
      {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success && Array.isArray(data.subjects)) {
      createdSubjects = data.subjects;
      console.log(`✅ Loaded ${createdSubjects.length} subjects from database`);
    } else {
      throw new Error('Invalid response format');
    }
    
  } catch (error) {
    console.error('❌ Failed to load subjects from database:', error);
    createdSubjects = [];
  }
}

async function loadQueueFromDatabase() {
  try {
    if (!userData.userEmail) {
      console.log('⚠️ User email not available');
      attendanceQueue = [];
      return;
    }
    
    console.log('📥 Loading queue from database for:', userData.userEmail);
    
    const response = await fetch(
      `${API_BASE_URL}/teacher/queue?email=${encodeURIComponent(userData.userEmail)}`,
      {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success && Array.isArray(data.queueData)) {
      attendanceQueue = data.queueData;
      console.log(`✅ Loaded ${attendanceQueue.length} queue items from database`);
    } else {
      throw new Error('Invalid response format');
    }
    
  } catch (error) {
    console.error('❌ Failed to load queue from database:', error);
    attendanceQueue = [];
  }
}

async function saveQueueToDatabase() {
  try {
    if (!userData.userEmail) return;
    
    console.log('💾 Saving queue to database...');
    
    const response = await fetch(`${API_BASE_URL}/teacher/queue`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        teacherEmail: userData.userEmail,
        queueData: attendanceQueue
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Queue saved to database:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Queue save failed:', error);
    throw error;
  }
}

async function loadCompletedFromDatabase() {
  try {
    if (!userData.userEmail) {
      console.log('⚠️ User email not available');
      completedClasses = [];
      return;
    }
    
    console.log('📥 Loading completed classes from database for:', userData.userEmail);
    
    const response = await fetch(
      `${API_BASE_URL}/teacher/completed?email=${encodeURIComponent(userData.userEmail)}`,
      {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success && Array.isArray(data.completedClasses)) {
      completedClasses = data.completedClasses;
      console.log(`✅ Loaded ${completedClasses.length} completed classes from database`);
    } else {
      throw new Error('Invalid response format');
    }
    
  } catch (error) {
    console.error('❌ Failed to load completed classes from database:', error);
    completedClasses = [];
  }
}

async function saveCompletedToDatabase(completedClass) {
  try {
    console.log('💾 Saving completed class to database...');
    
    const response = await fetch(`${API_BASE_URL}/teacher/completed`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        teacherEmail: userData.userEmail,
        completedClass: completedClass
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Completed class saved to database:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Completed class save failed:', error);
    throw error;
  }
}

async function loadAllData() {
  try {
    if (!userData.userEmail) {
      console.log('⚠️ Cannot load data: User email not available');
      return;
    }
    
    console.log('📦 Loading all data from database...');
    
    await Promise.all([
      loadSubjectsFromDatabase(),
      loadQueueFromDatabase(),
      loadCompletedFromDatabase()
    ]);
    
    console.log('✅ All data loaded from database:', {
      subjects: createdSubjects.length,
      queue: attendanceQueue.length,
      completed: completedClasses.length
    });
    
  } catch (error) {
    console.error('❌ Failed to load all data:', error);
  }
}
// ============================================================================
// DISPLAY FUNCTIONS - MOBILE OPTIMIZED
// ============================================================================

function updateQueueDisplay() {
  if (!elements.queueList) return;
  
  if (attendanceQueue.length === 0) {
    elements.emptyQueuePrompt?.classList.remove('hidden');
    elements.queueList.innerHTML = '';
    elements.queueList.style.display = 'none';
  } else {
    elements.emptyQueuePrompt?.classList.add('hidden');
    elements.queueList.style.display = 'flex';
    elements.queueList.style.flexDirection = 'column';
    elements.queueList.style.gap = '8px';
    
    elements.queueList.innerHTML = attendanceQueue.map((item, index) => `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 10px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        position: relative;
      ">
        <!-- Number & Close -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="
            width: 24px;
            height: 24px;
            background: #EFF6FF;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 700;
            color: #3B82F6;
          ">${index + 1}</div>
          
          <button onclick="removeFromQueue('${item.id}')" style="
            width: 24px;
            height: 24px;
            background: #FEF2F2;
            border: none;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            padding: 0;
          ">
            <span class="material-symbols-rounded" style="font-size: 14px; color: #EF4444;">close</span>
          </button>
        </div>
        
        <!-- Content -->
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <div style="
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
            border-radius: 7px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <span class="material-symbols-rounded" style="font-size: 16px; color: white; font-variation-settings: 'FILL' 1;">menu_book</span>
          </div>
          
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 14px; font-weight: 600; color: #1E293B; line-height: 1.2; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.subject}</div>
            <div style="display: inline-flex; align-items: center; gap: 5px; background: #EFF6FF; padding: 2px 8px; border-radius: 5px;">
              <span style="font-size: 11px; font-weight: 600; color: #3B82F6;">${item.stream}</span>
              <span style="font-size: 11px; font-weight: 600; color: #3B82F6;">•</span>
              <span style="font-size: 11px; font-weight: 600; color: #3B82F6;">Sem ${item.semester}</span>
            </div>
          </div>
        </div>
        
        <!-- Take Attendance Button -->
        <button onclick="takeAttendance('${item.id}')" style="
          width: 100%;
          padding: 10px;
          background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-family: 'Poppins', sans-serif;
          box-shadow: 0 2px 6px rgba(59, 130, 246, 0.25);
        ">
          <span class="material-symbols-rounded" style="font-size: 16px;">edit_note</span>
          <span>Take Attendance</span>
        </button>
      </div>
    `).join('');
  }
  
  if (elements.queueCount) {
    elements.queueCount.textContent = attendanceQueue.length;
  }
}


function updateSubjectsDisplay() {
  if (!elements.subjectsList) return;
  
  if (createdSubjects.length === 0) {
    elements.emptySubjectsPrompt?.classList.remove('hidden');
    elements.subjectsList.innerHTML = '';
    elements.subjectsList.style.display = 'none';
  } else {
    elements.emptySubjectsPrompt?.classList.add('hidden');
    elements.subjectsList.style.display = 'flex';
    elements.subjectsList.style.flexDirection = 'column';
    elements.subjectsList.style.gap = '10px';
    
    elements.subjectsList.innerHTML = createdSubjects.map(item => `
      <div style="
        background: white;
        border: 1px solid #E2E8F0;
        border-radius: 14px;
        padding: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        transition: all 0.2s;
      " onclick="addToQueue('${item.id}')">
        <div style="
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <span class="material-symbols-rounded" style="font-size: 20px; color: white; font-variation-settings: 'FILL' 1;">menu_book</span>
        </div>
        
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 14px; font-weight: 600; color: #1E293B; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.subject}</div>
          <div style="font-size: 12px; color: #64748B; display: flex; align-items: center; gap: 5px;">
            <span>${item.stream}</span>
            <span style="color: #CBD5E1;">•</span>
            <span>Sem ${item.semester}</span>
          </div>
        </div>
        
        <button onclick="event.stopPropagation(); deleteSubject('${item.id}')" style="
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #FEF2F2;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.2s;
        " onmouseover="this.style.background='#FEE2E2'" onmouseout="this.style.background='#FEF2F2'">
          <span class="material-symbols-rounded" style="font-size: 16px; color: #EF4444;">delete</span>
        </button>
      </div>
    `).join('');
  }
  
  // Add "Add Subject" button at the end
  const addButton = `
    <button onclick="showCreateSubjectForm()" style="
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
      border: none;
      border-radius: 14px;
      color: white;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s;
      font-family: 'Poppins', sans-serif;
      box-shadow: 0 3px 10px rgba(59, 130, 246, 0.3);
      margin-top: 2px;
    " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 12px rgba(59, 130, 246, 0.4)'" 
       onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 3px 10px rgba(59, 130, 246, 0.3)'">
      <span class="material-symbols-rounded" style="font-size: 18px;">add</span>
      <span>Add Subject</span>
    </button>
  `;
  
  elements.subjectsList.innerHTML += addButton;
}


function updateCompletedDisplay() {
  if (!elements.completedList) return;
  
  if (completedClasses.length === 0) {
    elements.emptyCompletedPrompt?.classList.remove('hidden');
    elements.completedList.innerHTML = '';
    elements.completedList.style.display = 'none';
  } else {
    elements.emptyCompletedPrompt?.classList.add('hidden');
    elements.completedList.style.display = 'flex';
    elements.completedList.style.flexDirection = 'column';
    elements.completedList.style.gap = '10px';
    
    elements.completedList.innerHTML = completedClasses.map(item => `
      <div style="
        background: white;
        border: 1px solid #E2E8F0;
        border-radius: 14px;
        padding: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="
            width: 42px;
            height: 42px;
            border-radius: 10px;
            background: linear-gradient(135deg, #10B981 0%, #059669 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <span class="material-symbols-rounded" style="font-size: 20px; color: white; font-variation-settings: 'FILL' 1;">check_circle</span>
          </div>
          
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 14px; font-weight: 600; color: #1E293B; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.subject}</div>
            <div style="font-size: 12px; color: #64748B; display: flex; align-items: center; gap: 5px; margin-bottom: 3px;">
              <span>${item.stream}</span>
              <span style="color: #CBD5E1;">•</span>
              <span>Sem ${item.semester}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-rounded" style="font-size: 12px; color: #94A3B8;">schedule</span>
              <span style="font-size: 11px; color: #94A3B8;">${new Date(item.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
            </div>
          </div>
          
          <button onclick="viewDetails('${item.id}')" style="
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: #F1F5F9;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex-shrink: 0;
            transition: all 0.2s;
          " onmouseover="this.style.background='#E2E8F0'" onmouseout="this.style.background='#F1F5F9'">
            <span class="material-symbols-rounded" style="font-size: 16px; color: #64748B;">chevron_right</span>
          </button>
        </div>
      </div>
    `).join('');
  }
  
  if (elements.completedCount) {
    elements.completedCount.textContent = completedClasses.length;
  }
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

async function addToQueue(subjectId) {
  const subject = createdSubjects.find(s => s.id === subjectId);
  if (!subject) return;
  
  const existsInQueue = attendanceQueue.some(item => 
    item.stream === subject.stream && 
    item.semester === subject.semester && 
    item.subject === subject.subject
  );
  
  if (existsInQueue) {
    showNotification('Already in queue', 'warning');
    return;
  }
  
  const queueItem = {
    id: Date.now().toString(),
    stream: subject.stream,
    semester: subject.semester,
    subject: subject.subject,
    addedAt: new Date().toISOString(),
    teacherEmail: userData.userEmail
  };
  
  attendanceQueue.push(queueItem);
  
  try {
    await saveQueueToDatabase();
    updateQueueDisplay();
    showNotification('Added to queue', 'success');
  } catch (error) {
    attendanceQueue.pop();
    showNotification('Failed to add to queue', 'error');
  }
}

async function removeFromQueue(itemId) {
  const originalQueue = [...attendanceQueue];
  attendanceQueue = attendanceQueue.filter(item => item.id !== itemId);
  
  try {
    await saveQueueToDatabase();
    updateQueueDisplay();
    showNotification('Removed from queue', 'success');
  } catch (error) {
    attendanceQueue = originalQueue;
    updateQueueDisplay();
    showNotification('Failed to remove from queue', 'error');
  }
}

// ============================================================================
// DELETE SUBJECT
// ============================================================================

async function deleteSubject(subjectId) {
  const subject = createdSubjects.find(s => s.id === subjectId);
  if (!subject) return;
  
  const confirmed = confirm(`Delete "${subject.subject}" for ${subject.stream} Sem ${subject.semester}?`);
  if (!confirmed) return;
  
  console.log('🗑️ Deleting subject:', subject);
  
  try {
    const response = await fetch(`${API_BASE_URL}/teacher/subjects/${subjectId}`, {
      method: 'DELETE',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        teacherEmail: userData.userEmail
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    await loadSubjectsFromDatabase();
    updateSubjectsDisplay();
    showNotification('Subject deleted successfully', 'success');
    console.log('✅ Subject deleted');
    
  } catch (error) {
    console.error('❌ Failed to delete subject:', error);
    showNotification('Failed to delete subject', 'error');
  }
}

// ============================================================================
// TAKE ATTENDANCE
// ============================================================================

async function takeAttendance(itemId) {
  const item = attendanceQueue.find(q => q.id === itemId);
  if (!item) {
    showNotification('Class not found', 'error');
    return;
  }
  
  console.log('📋 Taking attendance for:', item);
  
  try {
    const originalQueue = [...attendanceQueue];
    attendanceQueue = attendanceQueue.filter(q => q.id !== itemId);
    
    const completedClass = {
      id: Date.now().toString(),
      stream: item.stream,
      semester: item.semester,
      subject: item.subject,
      completedAt: new Date().toISOString(),
      teacherEmail: userData.userEmail
    };
    
    await Promise.all([
      saveQueueToDatabase(),
      saveCompletedToDatabase(completedClass)
    ]);
    
    completedClasses.push(completedClass);
    
    updateQueueDisplay();
    updateCompletedDisplay();
    
    showNotification('Class marked as completed', 'success');
    console.log('✅ Moved to completed history:', completedClass);
    
    sessionStorage.setItem('attendanceSession', JSON.stringify({
      stream: item.stream,
      semester: item.semester,
      subject: item.subject,
      completedId: completedClass.id,
      teacherEmail: userData.userEmail,
      teacherName: userData.userName
    }));
    
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 800);
    
  } catch (error) {
    console.error('❌ Failed to complete class:', error);
    await loadAllData();
    updateQueueDisplay();
    updateCompletedDisplay();
    showNotification('Failed to complete class', 'error');
  }
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

function showNotification(message, type = 'info') {
  const config = {
    success: {
      color: '#10B981',
      icon: 'fa-check-circle',
      bg: '#ECFDF5',
      border: '#10B981'
    },
    error: {
      color: '#EF4444',
      icon: 'fa-times-circle',
      bg: '#FEF2F2',
      border: '#EF4444'
    },
    warning: {
      color: '#F59E0B',
      icon: 'fa-exclamation-triangle',
      bg: '#FFFBEB',
      border: '#F59E0B'
    },
    info: {
      color: '#3B82F6',
      icon: 'fa-info-circle',
      bg: '#EFF6FF',
      border: '#3B82F6'
    }
  };
  
  const style = config[type] || config.info;
  
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${style.bg};
    color: ${style.color};
    padding: 20px 32px;
    border-radius: 12px;
    border: 2px solid ${style.border};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 16px;
    font-weight: 600;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    z-index: 99999;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 320px;
    animation: notificationSlideIn 0.3s ease;
  `;
  
  notification.innerHTML = `
    <i class="fas ${style.icon}" style="font-size: 24px;"></i>
    <span>${message}</span>
  `;
  
  if (!document.getElementById('notification-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'notification-styles';
    styleSheet.textContent = `
      @keyframes notificationSlideIn {
        from {
          opacity: 0;
          transform: translate(-50%, -60%);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }
      @keyframes notificationSlideOut {
        from {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
        to {
          opacity: 0;
          transform: translate(-50%, -40%);
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'notificationSlideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================================================
// USER INFO
// ============================================================================

function loadUserInfo() {
  return new Promise((resolve) => {
    const auth = getFirebaseAuth();
    const onAuthStateChanged = getOnAuthStateChanged();
    
    if (auth && onAuthStateChanged) {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          userData.userName = user.displayName || user.email.split('@')[0];
          userData.userEmail = user.email;
          userData.firebaseUid = user.uid;
          
          if (elements.userName) elements.userName.textContent = userData.userName;
          if (elements.userEmail) elements.userEmail.textContent = userData.userEmail;
          
          console.log('✅ User authenticated:', userData.userEmail);
          resolve(user);
        } else {
          console.log('⚠️ No user authenticated');
          resolve(null);
        }
      });
    } else {
      console.log('⚠️ Firebase auth not available');
      resolve(null);
    }
  });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing myclass...');
  
  try {
    await loadUserInfo();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (!userData.userEmail) {
      showNotification('Please log in first', 'warning');
      return;
    }
    
    await fetchStreamsFromDatabase();
    await loadAllData();
    
    updateQueueDisplay();
    updateSubjectsDisplay();
    updateCompletedDisplay();
    
    console.log('✅ Initialization complete');
  } catch (error) {
    console.error('❌ Initialization error:', error);
    showNotification('Initialization error', 'error');
  }
});

// ============================================================================
// GLOBAL FUNCTIONS
// ============================================================================

window.addToQueue = addToQueue;
window.removeFromQueue = removeFromQueue;
window.takeAttendance = takeAttendance;
window.deleteSubject = deleteSubject;
window.cancelCreateSubject = () => {
  if (elements.createSubjectPage) elements.createSubjectPage.classList.add('hidden');
  if (elements.todaySection) elements.todaySection.classList.remove('hidden');
};
