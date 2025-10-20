const express = require('express');
const router = express.Router();

// Middleware to check DB connection
const checkDB = (req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) {
    return res.status(503).json({ 
      success: false, 
      message: 'Database connection not available' 
    });
  }
  req.db = db;
  next();
};

router.use(checkDB);

// ============================================================================
// GET AVAILABLE STREAMS FOR DROPDOWN
// ============================================================================

router.get('/available-streams', async (req, res) => {
  try {
    console.log('📚 Fetching available streams from database...');
    
    // Get all unique streams from streams collection
    const streams = await req.db.collection('streams')
      .find({ isActive: true })
      .sort({ name: 1 })
      .toArray();
    
    // If no streams collection, get from students collection
    let streamList = [];
    if (streams.length > 0) {
      streamList = streams.map(s => ({
        code: s.streamCode || s.name,
        name: s.name,
        fullName: s.fullName || s.name
      }));
    } else {
      // Fallback: get unique streams from students
      const uniqueStreams = await req.db.collection('students')
        .distinct('stream', { isActive: true });
      
      streamList = uniqueStreams.map(s => ({
        code: s,
        name: s,
        fullName: s
      }));
    }
    
    console.log(`✅ Found ${streamList.length} streams`);
    
    res.json({
      success: true,
      streams: streamList
    });
    
  } catch (error) {
    console.error('❌ Error fetching streams:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// GET AVAILABLE SEMESTERS FOR A STREAM
// ============================================================================

router.get('/available-semesters/:stream', async (req, res) => {
  try {
    const { stream } = req.params;
    console.log(`📚 Fetching available semesters for ${stream}...`);
    
    // Get unique semesters from students collection
    const semesters = await req.db.collection('students')
      .distinct('semester', { 
        stream: stream,
        isActive: true 
      });
    
    const sortedSemesters = semesters
      .map(s => parseInt(s))
      .filter(s => !isNaN(s))
      .sort((a, b) => a - b);
    
    console.log(`✅ Found semesters: ${sortedSemesters.join(', ')}`);
    
    res.json({
      success: true,
      semesters: sortedSemesters
    });
    
  } catch (error) {
    console.error('❌ Error fetching semesters:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ============================================================================
// STUDENT SUBJECT REPORT - FULLY DYNAMIC FROM DB
// ============================================================================

router.get('/student-subject-report/:stream/:semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const semesterNum = parseInt(semester.replace('sem', ''));
    
    console.log(`📊 Generating report for ${stream} Semester ${semesterNum}`);
    
    // 1. Get all students for this stream and semester from DB
    const students = await req.db.collection('students')
      .find({ 
        stream: stream,
        semester: semesterNum,
        isActive: true
      })
      .sort({ studentID: 1, name: 1 })
      .toArray();
    
    if (students.length === 0) {
      return res.json({
        success: true,
        message: 'No students found for this stream and semester',
        stream: stream,
        semester: semesterNum,
        totalStudents: 0,
        totalSubjects: 0,
        subjects: [],
        students: [],
        reportDate: new Date().toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      });
    }
    
    console.log(`✅ Found ${students.length} students`);
    
    // 2. Get all subjects for this stream and semester from DB
    const subjects = await req.db.collection('subjects')
      .find({
        stream: stream,
        semester: semesterNum,
        isActive: true
      })
      .sort({ name: 1 })
      .toArray();
    
    console.log(`✅ Found ${subjects.length} subjects`);
    
    if (subjects.length === 0) {
      return res.json({
        success: true,
        message: 'No subjects found for this stream and semester',
        stream: stream,
        semester: semesterNum,
        totalStudents: students.length,
        totalSubjects: 0,
        subjects: [],
        students: [],
        reportDate: new Date().toLocaleDateString('en-IN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      });
    }
    
    const subjectNames = subjects.map(s => s.name);
    
    // 3. Calculate attendance for each student-subject combination from DB
    const studentReports = await Promise.all(students.map(async (student) => {
      const subjectData = {};
      
      for (const subject of subjects) {
        // Get all attendance records for this student and subject from DB
        const attendanceRecords = await req.db.collection('attendance')
          .find({
            studentID: student.studentID,
            subject: subject.name,
            stream: stream,
            semester: semesterNum
          })
          .toArray();
        
        if (attendanceRecords.length > 0) {
          const totalClasses = attendanceRecords.length;
          const presentCount = attendanceRecords.filter(a => 
            a.status === 'Present' || a.status === 'present'
          ).length;
          const percentage = totalClasses > 0 ? 
            Math.round((presentCount / totalClasses) * 100) : 0;
          
          subjectData[subject.name] = {
            present: presentCount,
            total: totalClasses,
            percentage: percentage
          };
        } else {
          // No attendance records found
          subjectData[subject.name] = {
            present: 0,
            total: 0,
            percentage: 0
          };
        }
      }
      
      return {
        studentID: student.studentID,
        name: student.name,
        subjects: subjectData
      };
    }));
    
    console.log(`✅ Calculated attendance for ${studentReports.length} students`);
    
    // 4. Return complete report data
    res.json({
      success: true,
      stream: stream,
      semester: semesterNum,
      totalStudents: students.length,
      totalSubjects: subjectNames.length,
      subjects: subjectNames,
      students: studentReports,
      reportDate: new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    });
    
    console.log(`✅ Report generated successfully!`);
    
  } catch (error) {
    console.error('❌ Error generating report:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate report'
    });
  }
});

module.exports = router;
