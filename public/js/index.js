// ============================================================================
// ATTENDANCE.JS - COMPLETE DATABASE-INTEGRATED VERSION
// ============================================================================

// API base URL
const API_BASE_URL = '/api';

// Global variables
let currentClassInfo = null;
let isPreSelectedSubject = false;
let userData = {
  userName: 'Teacher',
  userEmail: 'teacher@school.edu',
  firebaseUid: null
};

// DOM Elements
const dateInput = document.getElementById('date');
const subjectSelect = document.getElementById('subject');
const subjectDisplay = document.getElementById('subjectDisplay');
const selectedSubjectName = document.getElementById('selectedSubjectName');
const studentsList = document.getElementById('students-list');
const presentCountSpan = document.getElementById('presentCount');
const absentCountSpan = document.getElementById('absentCount');

// Search Elements
const searchContainer = document.getElementById('searchContainer');
const studentSearchInput = document.getElementById('studentSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchStats = document.getElementById('searchStats');
const submitBtn = document.getElementById('submitAttendance');
const classInfoCard = document.getElementById('classInfoCard');

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

function saveToLocalStorage() {
  const attendanceData = {
    date: dateInput.value,
    subject: getSelectedSubject(),
    students: [],
    presentCount: presentCountSpan.textContent,
    absentCount: absentCountSpan.textContent,
    classInfo: currentClassInfo,
    isPreSelected: isPreSelectedSubject,
    timestamp: new Date().toISOString()
  };

  const checkboxes = studentsList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    attendanceData.students.push({
      studentID: checkbox.dataset.studentId || checkbox.value,
      name: checkbox.dataset.studentName || 'Unknown',
      present: checkbox.checked
    });
  });

  localStorage.setItem('attendanceData', JSON.stringify(attendanceData));
}

function loadFromLocalStorage() {
  const savedData = localStorage.getItem('attendanceData');
  if (savedData) {
    try {
      const attendanceData = JSON.parse(savedData);
      
      if (attendanceData.date) {
        dateInput.value = attendanceData.date;
      }
      
      if (attendanceData.classInfo && attendanceData.isPreSelected) {
        currentClassInfo = attendanceData.classInfo;
        isPreSelectedSubject = true;
        showPreSelectedSubject(currentClassInfo.subject);
        showClassInfo(currentClassInfo);
        loadStudentsFromDatabase(currentClassInfo);
      }
      
      setTimeout(() => {
        if (attendanceData.students && attendanceData.students.length > 0) {
          restoreStudentAttendance(attendanceData.students);
        }
      }, 1000);
      
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  }
}

function restoreStudentAttendance(savedStudents) {
  const checkboxes = studentsList.querySelectorAll('input[type="checkbox"]');
  
  checkboxes.forEach(checkbox => {
    const studentID = checkbox.dataset.studentId || checkbox.value;
    const savedStudent = savedStudents.find(s => s.studentID === studentID);
    
    if (savedStudent) {
      checkbox.checked = savedStudent.present;
    }
  });
  
  const total = checkboxes.length;
  const present = Array.from(checkboxes).filter(cb => cb.checked).length;
  updateCounts(present, total - present);
}

function clearLocalStorage() {
  localStorage.removeItem('attendanceData');
}

// ============================================================================
// SUBJECT SELECTION FUNCTIONS
// ============================================================================

function getSelectedSubject() {
  if (isPreSelectedSubject && currentClassInfo) {
    return currentClassInfo.subject;
  }
  return subjectSelect.value;
}

function showPreSelectedSubject(subjectName) {
  selectedSubjectName.textContent = subjectName;
  subjectDisplay.classList.remove('hidden');
  subjectSelect.classList.add('hidden');
  isPreSelectedSubject = true;
}

function showSubjectDropdown() {
  subjectDisplay.classList.add('hidden');
  subjectSelect.classList.remove('hidden');
  isPreSelectedSubject = false;
}

// ============================================================================
// TIME SLOT CALCULATION
// ============================================================================

function calculateCurrentTimeSlot() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    let startHour, startMinute;
    
    if (currentMinute < 30) {
      startHour = currentHour;
      startMinute = 0;
    } else {
      startHour = currentHour;
      startMinute = 30;
    }
    
    let endHour = startHour;
    let endMinute = startMinute + 60;
    
    if (endMinute >= 60) {
      endMinute = endMinute - 60;
      endHour = endHour + 1;
    }
    
    const formatTime = (h, m) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const displayMinute = m.toString().padStart(2, '0');
      return `${displayHour}:${displayMinute} ${period}`;
    };
    
    return `${formatTime(startHour, startMinute)} - ${formatTime(endHour, endMinute)}`;
    
  } catch (error) {
    console.warn('⚠️ Error calculating time slot:', error);
    return 'Current Period';
  }
}

// ============================================================================
// CLASS INFO DISPLAY
// ============================================================================

function showClassInfo(classInfo) {
  document.getElementById('classSubjectName').textContent = classInfo.subject;
  document.getElementById('classStreamSem').textContent = `${classInfo.stream} • Semester ${classInfo.semester}`;
  document.getElementById('classDate').textContent = new Date().toLocaleDateString();
  
  const timeSlot = calculateCurrentTimeSlot();
  const timeSlotElement = document.getElementById('classTimeSlot');
  if (timeSlotElement) {
    timeSlotElement.innerHTML = `
      <i class="fas fa-clock" style="margin-right: 4px; opacity: 0.8;"></i>
      ${timeSlot}
    `;
  }
  
  classInfoCard.classList.remove('hidden');
}

// ============================================================================
// LOAD STUDENTS FROM DATABASE
// ============================================================================

async function loadStudentsFromDatabase(classInfo) {
  try {
    showLoadingState();
    console.log('📥 Loading students for:', classInfo);
    
    // Try to load students from database
    const response = await fetch(`${API_BASE_URL}/students/${encodeURIComponent(classInfo.stream)}/sem${classInfo.semester}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📦 Students response:', data);
    
    if (data.success && data.students) {
      displayStudents(data.students);
    } else {
      displayStudents([]);
    }
    
  } catch (error) {
    console.error('❌ Error loading students:', error);
    showErrorState('Failed to load students from database');
  }
}

// ============================================================================
// DISPLAY STUDENTS
// ============================================================================

function displayStudents(students) {
  if (!students || students.length === 0) {
    studentsList.innerHTML = `
      <tr>
        <td colspan="4" style="padding: 20px; text-align: center; color: #6b7280;">
          <div style="font-size: 2rem; margin-bottom: 8px; color: #d1d5db;">📚</div>
          <div>No students found for this selection</div>
        </td>
      </tr>
    `;
    updateCounts(0, 0);
    saveToLocalStorage();
    hideSearchContainer();
    return;
  }
  
  // Sort students by ID
  const sortedStudents = students.sort((a, b) => {
    const aNum = parseInt(a.studentID);
    const bNum = parseInt(b.studentID);
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum;
    }
    
    return a.studentID.localeCompare(b.studentID, undefined, { numeric: true });
  });
  
  studentsList.innerHTML = sortedStudents.map((student, index) => `
    <tr>
      <td style="font-weight: 600;">${index + 1}</td>
      <td class="student-id">${student.studentID}</td>
      <td class="student-name">${student.name}</td>
      <td>
        <input 
          type="checkbox" 
          class="checkbox" 
          data-student-id="${student.studentID}" 
          data-student-name="${student.name}"
          value="${student.studentID}"
          checked 
        />
      </td>
    </tr>
  `).join('');
  
  updateCounts(sortedStudents.length, 0);
  saveToLocalStorage();
  showSearchContainer();
  
  console.log(`✅ Displayed ${sortedStudents.length} students`);
}

// ============================================================================
// LOADING & ERROR STATES
// ============================================================================

function showLoadingState() {
  studentsList.innerHTML = `
    <tr>
      <td colspan="4" style="padding: 30px; text-align: center;">
        <div style="display: inline-block; width: 24px; height: 24px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <div style="margin-top: 12px; color: #6b7280;">Loading students...</div>
      </td>
    </tr>
  `;
  updateCounts(0, 0);
  hideSearchContainer();
}

function showErrorState(message) {
  studentsList.innerHTML = `
    <tr>
      <td colspan="4" style="padding: 20px; text-align: center; color: #EF5350;">
        <div style="font-size: 1.5rem; margin-bottom: 8px;">⚠️</div>
        <div>${message}</div>
        <button onclick="location.reload()" style="margin-top: 12px; padding: 8px 16px; background: #EF5350; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
          Retry
        </button>
      </td>
    </tr>
  `;
  updateCounts(0, 0);
  hideSearchContainer();
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

function showSearchContainer() {
  if (searchContainer) searchContainer.classList.remove('hidden');
}

function hideSearchContainer() {
  if (searchContainer) searchContainer.classList.add('hidden');
}

function handleStudentSearch() {
  const searchTerm = studentSearchInput.value.toLowerCase().trim();
  
  if (searchTerm) {
    clearSearchBtn?.classList.remove('hidden');
  } else {
    clearSearchBtn?.classList.add('hidden');
  }
  
  if (!searchTerm) {
    clearSearch();
    return;
  }
  
  const tableBody = document.getElementById('students-list');
  if (!tableBody) return;
  
  const rows = tableBody.querySelectorAll('tr');
  let visibleCount = 0;
  let totalCount = 0;
  
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) {
      row.style.display = 'none';
      return;
    }
    
    totalCount++;
    
    const studentId = cells[1]?.textContent?.toLowerCase().trim() || '';
    const studentName = cells[2]?.textContent?.toLowerCase().trim() || '';
    
    const matchesSearch = studentId.includes(searchTerm) || studentName.includes(searchTerm);
    
    if (matchesSearch) {
      row.style.display = '';
      visibleCount++;
    } else {
      row.style.display = 'none';
    }
  });
  
  updateSearchStats(visibleCount, totalCount, searchTerm);
}

function clearSearch() {
  if (studentSearchInput) {
    studentSearchInput.value = '';
  }
  
  clearSearchBtn?.classList.add('hidden');
  
  const tableBody = document.getElementById('students-list');
  if (!tableBody) return;
  
  const rows = tableBody.querySelectorAll('tr');
  rows.forEach(row => {
    row.style.display = '';
  });
  
  if (searchStats) {
    searchStats.textContent = '';
  }
}

function updateSearchStats(visibleCount, totalCount, searchTerm) {
  if (!searchStats) return;
  
  if (visibleCount === 0) {
    searchStats.innerHTML = `<span style="color: #EF5350;"><i class="fas fa-exclamation-circle mr-1"></i>No students found matching "${searchTerm}"</span>`;
  } else if (visibleCount === totalCount) {
    searchStats.textContent = '';
  } else {
    searchStats.innerHTML = `<span style="color: #7BBDE8;"><i class="fas fa-filter mr-1"></i>Showing ${visibleCount} of ${totalCount} students</span>`;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function updateCounts(present, absent) {
  if (presentCountSpan) presentCountSpan.textContent = present;
  if (absentCountSpan) absentCountSpan.textContent = absent;
}

function showNotification(message, type = 'info') {
  const colors = {
    success: '#4CAF50',
    error: '#EF5350',
    warning: '#FFD54F',
    info: '#3EBDB6'
  };
  
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 10000;
    background: white; padding: 16px 20px; border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    border-left: 4px solid ${colors[type] || colors.info};
    max-width: 320px; animation: slideInRight 0.3s ease;
  `;
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}" 
         style="color: ${colors[type]}; font-size: 1.2rem;"></i>
      <span style="color: #001D39; font-weight: 500;">${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================================================
// SUCCESS CONFIRMATION DIALOG
// ============================================================================

function showSubmittedConfirmation(subject, date, presentStudents, totalStudents) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 29, 57, 0.7); z-index: 10000;
    display: flex; align-items: center; justify-content: center; padding: 20px;
    backdrop-filter: blur(8px);
  `;
  
  overlay.innerHTML = `
    <div style="
      background: white;
      border-radius: 20px; 
      padding: 32px; 
      max-width: 360px; 
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3); 
      text-align: center;
      animation: slideUp 0.4s ease;
    ">
      <div style="
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4CAF50, #66BB6A);
        margin: 0 auto 24px auto;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 30px rgba(76, 175, 80, 0.3);
        animation: successPulse 0.6s ease;
      ">
        <i class="fas fa-check" style="color: white; font-size: 2.5rem;"></i>
      </div>
      
      <h3 style="color: #001D39; margin: 0 0 20px 0; font-size: 1.5rem; font-weight: 700;">
        Attendance Submitted!
      </h3>
      
      <div style="background: rgba(76, 175, 80, 0.1); padding: 20px; border-radius: 12px; margin-bottom: 24px; text-align: left;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <i class="fas fa-book" style="color: #3EBDB6; font-size: 1.1rem; width: 20px;"></i>
          <span style="color: #001D39; font-weight: 600;">${subject}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <i class="fas fa-calendar-check" style="color: #3EBDB6; font-size: 1.1rem; width: 20px;"></i>
          <span style="color: #001D39; font-weight: 500;">${date}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 12px;">
          <i class="fas fa-user-check" style="color: #4CAF50; font-size: 1.1rem; width: 20px;"></i>
          <span style="color: #4CAF50; font-weight: 700; font-size: 1.1rem;">
            ${presentStudents}/${totalStudents} Present
          </span>
        </div>
      </div>
      
      <p style="color: rgba(1, 29, 57, 0.7); font-size: 0.9rem; margin-bottom: 24px;">
        ✨ Your attendance has been successfully recorded
      </p>
      
      <button id="okBtn" style="
        width: 100%;
        padding: 16px 24px; 
        border: none; 
        background: linear-gradient(135deg, #4CAF50, #66BB6A);
        color: white; 
        border-radius: 12px; 
        font-weight: 700; 
        cursor: pointer; 
        font-size: 1rem;
        box-shadow: 0 8px 24px rgba(76, 175, 80, 0.3);
        transition: all 0.3s ease;
      ">
        <i class="fas fa-thumbs-up" style="margin-right: 8px;"></i>
        Perfect!
      </button>
    </div>
  `;

  // Add animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(30px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes successPulse {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.1); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(overlay);

  const okBtn = overlay.querySelector('#okBtn');
  okBtn.addEventListener('mouseenter', () => {
    okBtn.style.transform = 'translateY(-2px)';
    okBtn.style.boxShadow = '0 12px 32px rgba(76, 175, 80, 0.4)';
  });
  okBtn.addEventListener('mouseleave', () => {
    okBtn.style.transform = 'translateY(0)';
    okBtn.style.boxShadow = '0 8px 24px rgba(76, 175, 80, 0.3)';
  });

  okBtn.onclick = () => {
    overlay.remove();
    // Redirect back to myclass.html
    setTimeout(() => window.location.href = 'myclass.html', 500);
  };

  // Auto close after 4 seconds
  setTimeout(() => {
    if (overlay.parentElement) {
      overlay.remove();
      setTimeout(() => window.location.href = 'myclass.html', 500);
    }
  }, 4000);
}

// ============================================================================
// CONFIRM DIALOG
// ============================================================================

function showConfirm(message, subject, date, totalStudents, presentStudents, absentStudents, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 29, 57, 0.7); z-index: 10000;
    display: flex; align-items: center; justify-content: center; padding: 20px;
    backdrop-filter: blur(5px);
  `;
  
  overlay.innerHTML = `
    <div style="background: white; border-radius: 16px; padding: 28px; max-width: 340px; width: 100%; box-shadow: 0 15px 40px rgba(0,0,0,0.2);">
      <div style="text-align: center; margin-bottom: 20px;">
        <i class="fas fa-question-circle" style="color: #3EBDB6; font-size: 3rem; margin-bottom: 12px;"></i>
        <h3 style="color: #001D39; margin: 0; font-size: 1.2rem; font-weight: 700;">Submit Attendance?</h3>
      </div>
      
      <div style="margin-bottom: 20px; background: rgba(62, 189, 182, 0.1); padding: 16px; border-radius: 12px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <i class="fas fa-book" style="color: #3EBDB6; width: 18px;"></i>
          <span style="color: #001D39; font-weight: 600;">${subject}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <i class="fas fa-calendar-alt" style="color: #3EBDB6; width: 18px;"></i>
          <span style="color: #001D39;">${date}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <i class="fas fa-users" style="color: #3EBDB6; width: 18px;"></i>
          <span style="color: #001D39;">Total: ${totalStudents}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <i class="fas fa-user-check" style="color: #4CAF50; width: 18px;"></i>
          <span style="color: #4CAF50; font-weight: 600;">Present: ${presentStudents}</span>
        </div>
        
        <div style="display: flex; align-items: center; gap: 10px;">
          <i class="fas fa-user-times" style="color: #EF5350; width: 18px;"></i>
          <span style="color: #EF5350; font-weight: 600;">Absent: ${absentStudents}</span>
        </div>
      </div>
      
      <div style="display: flex; gap: 12px;">
        <button id="cancelBtn" style="flex: 1; padding: 12px; border: 2px solid #3EBDB6; background: white; color: #3EBDB6; border-radius: 10px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
          <i class="fas fa-times" style="margin-right: 6px;"></i>Cancel
        </button>
        
        <button id="confirmBtn" style="flex: 1; padding: 12px; border: none; background: linear-gradient(135deg, #3EBDB6, #5ECFC9); color: white; border-radius: 10px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(62, 189, 182, 0.3); transition: all 0.2s;">
          <i class="fas fa-paper-plane" style="margin-right: 6px;"></i>Submit
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cancelBtn = overlay.querySelector('#cancelBtn');
  const confirmBtn = overlay.querySelector('#confirmBtn');

  cancelBtn.onclick = () => overlay.remove();
  confirmBtn.onclick = () => {
    overlay.remove();
    onConfirm();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

// ============================================================================
// SUBMIT FUNCTION
// ============================================================================

function setupSubmitButton() {
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const subject = getSelectedSubject();
      const date = dateInput.value;

      if (!subject || !date) {
        showNotification("Please select date and subject", "error");
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      if (date > today) {
        showNotification("Future dates are not allowed", "error");
        return;
      }

      const checkboxes = studentsList.querySelectorAll("input[type='checkbox']");
      const checkedBoxes = studentsList.querySelectorAll("input:checked");
      const totalStudents = checkboxes.length;
      const presentStudents = checkedBoxes.length;
      const absentStudents = totalStudents - presentStudents;

      if (totalStudents === 0) {
        showNotification("No students found for attendance", "error");
        return;
      }

      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });

      showConfirm(
        "confirm",
        subject,
        formattedDate,
        totalStudents,
        presentStudents,
        absentStudents,
        async () => {
          try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            const studentsPresent = Array.from(checkedBoxes).map(cb => 
              cb.dataset.studentId || cb.value
            );

            const timeSlot = calculateCurrentTimeSlot();

            const apiUrl = currentClassInfo 
              ? `${API_BASE_URL}/attendance/${encodeURIComponent(currentClassInfo.stream)}/sem${currentClassInfo.semester}/${encodeURIComponent(subject)}`
              : `${API_BASE_URL}/attendance`;

            console.log('📤 Submitting attendance:', {
              date,
              time: timeSlot,
              teacherEmail: userData.userEmail,
              subject,
              presentStudents: studentsPresent.length,
              totalStudents
            });

            const res = await fetch(apiUrl, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              body: JSON.stringify({ 
                date, 
                time: timeSlot,
                teacherEmail: userData.userEmail,
                subject, 
                studentsPresent, 
                totalStudents,
                presentCount: presentStudents, 
                absentCount: absentStudents,
                classInfo: currentClassInfo
              })
            });

            if (!res.ok) {
              const errorText = await res.text();
              throw new Error(`HTTP ${res.status}: ${errorText}`);
            }

            const result = await res.json();

            if (result.success !== false) {
              showSubmittedConfirmation(subject, formattedDate, presentStudents, totalStudents);
              
              clearLocalStorage();
              dateInput.value = new Date().toISOString().split("T")[0];
              
              if (!isPreSelectedSubject) {
                subjectSelect.value = "";
              }
              
              checkboxes.forEach(cb => cb.checked = false);
              updateCounts(0, 0);
              
            } else {
              showNotification("Submission failed: " + (result.message || "Unknown error"), "error");
            }

          } catch (err) {
            console.error("❌ Submission error:", err);
            showNotification("Error: " + err.message, "error");
          } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Attendance';
          }
        }
      );
    });
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Checkbox changes
  if (studentsList) {
    studentsList.addEventListener('change', function(event) {
      if (event.target && event.target.matches('input[type="checkbox"]')) {
        const checkboxes = studentsList.querySelectorAll('input[type="checkbox"]');
        const total = checkboxes.length;
        const present = Array.from(checkboxes).filter(cb => cb.checked).length;
        updateCounts(present, total - present);
        saveToLocalStorage();
      }
    });
  }

  // Date change
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      const selectedDate = dateInput.value;
      const today = new Date().toISOString().split('T')[0];
      
      if (selectedDate > today) {
        showNotification('⚠️ Future dates are not allowed!', 'warning');
        dateInput.value = today;
      }
      
      saveToLocalStorage();
    });
  }

  // Search functionality
  if (studentSearchInput) {
    studentSearchInput.addEventListener('input', handleStudentSearch);
    studentSearchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        clearSearch();
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', clearSearch);
  }

  // Submit button
  setupSubmitButton();
}

// ============================================================================
// LOAD USER INFO
// ============================================================================

function loadUserInfo() {
  if (window.auth && window.onAuthStateChanged) {
    window.onAuthStateChanged(window.auth, (user) => {
      if (user) {
        userData.userName = user.displayName || user.email.split('@')[0];
        userData.userEmail = user.email;
        userData.firebaseUid = user.uid;
        console.log('✅ User authenticated:', userData);
      }
    });
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log('🚀 Attendance page initialized');
  
  // Load user info
  loadUserInfo();
  
  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
  dateInput.max = today;

  // ✅ FIX: Check for attendanceSession (from myclass.html)
  const attendanceSession = sessionStorage.getItem('attendanceSession');
  
  if (attendanceSession) {
    try {
      currentClassInfo = JSON.parse(attendanceSession);
      console.log('🎯 Auto-loading class from myclass:', currentClassInfo);
      
      isPreSelectedSubject = true;
      showPreSelectedSubject(currentClassInfo.subject);
      showClassInfo(currentClassInfo);
      
      await loadStudentsFromDatabase(currentClassInfo);
      sessionStorage.removeItem('attendanceSession');
      
    } catch (error) {
      console.error('❌ Error parsing attendanceSession:', error);
      showSubjectDropdown();
    }
  } else {
    // Check localStorage for persistence
    const savedData = localStorage.getItem('attendanceData');
    if (savedData) {
      loadFromLocalStorage();
    } else {
      showSubjectDropdown();
    }
  }

  setupEventListeners();
});
