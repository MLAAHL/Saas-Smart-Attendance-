// routes/viewAttendanceRoutes.js - COMPLETE FIXED VERSION
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ============================================================================
// SCHEMA (Shared with markAttendanceRoutes)
// ============================================================================

const attendanceSchema = new mongoose.Schema({
  stream: { type: String, required: true, trim: true },
  semester: { type: Number, required: true, min: 1, max: 8 },
  subject: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  studentsPresent: { type: [String], required: true },
  totalStudents: { type: Number, required: true, min: 0 },
  presentCount: { type: Number, required: true, min: 0 },
  absentCount: { type: Number, required: true, min: 0 }
}, { 
  timestamps: true,
  collection: 'attendance'
});

attendanceSchema.index({ stream: 1, semester: 1, subject: 1, date: -1 }, { background: true });
attendanceSchema.index({ date: -1, stream: 1 }, { background: true });
attendanceSchema.index({ createdAt: -1 }, { background: true });

attendanceSchema.pre('save', function(next) {
  if (!this.presentCount) this.presentCount = this.studentsPresent.length;
  if (!this.absentCount) this.absentCount = this.totalStudents - this.presentCount;
  next();
});

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

// ============================================================================
// CACHING
// ============================================================================

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(prefix, params) {
  return `${prefix}:${JSON.stringify(params)}`;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function getCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return cached.data;
}

function clearCachePattern(pattern) {
  for (const key of cache.keys()) {
    if (key.startsWith(pattern)) cache.delete(key);
  }
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

router.use((req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) return res.status(503).json({ success: false, error: 'Database unavailable' });
  req.db = db;
  next();
});

// ============================================================================
// HELPER ROUTES - FIXED VERSION
// ============================================================================

// GET - All unique streams from streams collection
router.get('/streams', async (req, res) => {
  try {
    const db = req.db;
    
    console.log('📚 [VIEW] Fetching all streams from streams collection');
    
    const streams = await db.collection('streams')
      .find({ isActive: true })
      .sort({ name: 1 })
      .toArray();
    
    console.log(`✅ [VIEW] Found ${streams.length} active streams`);
    
    // Return just the stream codes/names as strings
    const streamList = streams.map(s => s.streamCode || s.name);
    
    res.json({
      success: true,
      streams: streamList,
      count: streamList.length
    });
    
  } catch (error) {
    console.error('❌ [VIEW] Error fetching streams:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET - All unique semesters for a stream from students collection
router.get('/semesters/:stream', async (req, res) => {
  try {
    const { stream } = req.params;
    
    console.log('🔍 [VIEW] Fetching semesters for stream:', stream);
    
    // Try to get semesters from students collection
    const semesters = await req.db.collection('students')
      .distinct('semester', { 
        stream: { $regex: new RegExp(`^${stream}$`, 'i') }, // Case-insensitive match
        isActive: true 
      });
    
    console.log('📊 [VIEW] Found semesters:', semesters);
    
    const sortedSemesters = semesters
      .map(s => parseInt(s))
      .filter(s => !isNaN(s) && s > 0)
      .sort((a, b) => a - b);
    
    console.log('✅ [VIEW] Sorted semesters:', sortedSemesters);
    
    res.json({ 
      success: true, 
      stream,
      semesters: sortedSemesters
    });
    
  } catch (error) {
    console.error('❌ [VIEW] Error fetching semesters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// GET - All subjects for a stream and semester - USES STREAM NAME
router.get('/subjects/:stream/:semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const semesterNumber = parseInt(semester.replace('sem', ''));
    
    console.log('📚 [VIEW] Fetching subjects for:', { stream, semester: semesterNumber });
    
    // Step 1: Find the stream document to get the correct stream name
    const streamDoc = await req.db.collection('streams')
      .findOne({ 
        $or: [
          { streamCode: { $regex: new RegExp(`^${stream}$`, 'i') } },
          { name: { $regex: new RegExp(`^${stream}$`, 'i') } }
        ],
        isActive: true
      });
    
    if (!streamDoc) {
      console.warn('⚠️ [VIEW] Stream document not found:', stream);
      return res.json({
        success: true,
        stream,
        semester: semesterNumber,
        subjects: [],
        count: 0,
        message: 'Stream not found'
      });
    }
    
    console.log('✅ [VIEW] Found stream document:', {
      name: streamDoc.name,
      streamCode: streamDoc.streamCode
    });
    
    // Step 2: Use the stream NAME from the streams collection to find subjects
    const streamName = streamDoc.name; // This will be "BDA" for BCom-BDA
    
    console.log('🔍 [VIEW] Searching subjects with stream name:', streamName);
    
    // Step 3: Find subjects using the stream name
    const subjects = await req.db.collection('subjects')
      .find({ 
        stream: { $regex: new RegExp(`^${streamName}$`, 'i') },
        semester: semesterNumber,
        isActive: true 
      })
      .sort({ name: 1 })
      .toArray();
    
    console.log(`✅ [VIEW] Found ${subjects.length} subjects for stream "${streamName}"`);
    
    // Step 4: Format and return
    const formattedSubjects = subjects.map(s => ({
      name: s.name || s.subjectName || s.subject,
      code: s.subjectCode || s.code || '',
      _id: s._id
    }));
    
    res.json({
      success: true,
      stream,
      streamName: streamName,
      semester: semesterNumber,
      subjects: formattedSubjects,
      count: formattedSubjects.length
    });
    
  } catch (error) {
    console.error('❌ [VIEW] Error fetching subjects:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stream: req.params.stream,
      semester: req.params.semester
    });
  }
});

// ============================================================================
// VIEW ATTENDANCE ROUTES
// ============================================================================

// GET - Attendance Register (Full Register Book View)
router.get('/attendance/register/:stream/:semester/:subject', async (req, res) => {
  try {
    const { stream, semester, subject } = req.params;
    const semesterNumber = parseInt(semester.replace('sem', ''));
    
    console.log('📚 [VIEW] Fetching register for:', { stream, semester: semesterNumber, subject });
    
    // Get all students for this class
    const students = await req.db.collection('students')
      .find({ 
        stream: { $regex: new RegExp(`^${stream}$`, 'i') },
        semester: semesterNumber, 
        isActive: true 
      })
      .project({ _id: 1, name: 1, studentID: 1, rollNumber: 1 })
      .sort({ studentID: 1 })
      .toArray();
    
    console.log(`📊 [VIEW] Found ${students.length} students`);
    
    // Get all attendance records for this subject
    const attendanceRecords = await Attendance.find({
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
      semester: semesterNumber,
      subject: { $regex: new RegExp(`^${subject}$`, 'i') }
    })
    .sort({ date: 1, time: 1 })
    .lean()
    .exec();
    
    console.log(`📊 [VIEW] Found ${attendanceRecords.length} attendance sessions`);
    
    // Format sessions
    const sessions = attendanceRecords.map(record => ({
      _id: record._id,
      date: record.date,
      time: record.time,
      studentsPresent: record.studentsPresent,
      totalStudents: record.totalStudents,
      presentCount: record.presentCount,
      absentCount: record.absentCount
    }));
    
    const totalSessions = sessions.length;
    
    // Build register data for each student
    const registerData = students.map(student => {
      const studentAttendance = sessions.map(session => ({
        date: session.date,
        time: session.time,
        status: session.studentsPresent.includes(student.studentID) ? 'P' : 'A',
        sessionId: session._id
      }));
      
      const presentCount = studentAttendance.filter(a => a.status === 'P').length;
      const absentCount = studentAttendance.filter(a => a.status === 'A').length;
      const attendancePercentage = totalSessions > 0 
        ? ((presentCount / totalSessions) * 100).toFixed(2) 
        : 0;
      
      return {
        studentID: student.studentID,
        name: student.name,
        rollNumber: student.rollNumber,
        attendance: studentAttendance,
        presentCount,
        absentCount,
        totalSessions,
        attendancePercentage
      };
    });
    
    res.json({
      success: true,
      stream,
      semester: semesterNumber,
      subject,
      students: registerData,
      sessions,
      totalSessions,
      totalStudents: students.length,
      statistics: {
        totalPossibleAttendances: totalSessions * students.length,
        averageAttendance: registerData.length > 0
          ? (registerData.reduce((sum, s) => sum + parseFloat(s.attendancePercentage), 0) / registerData.length).toFixed(2)
          : 0
      }
    });
    
  } catch (error) {
    console.error('❌ [VIEW] Error fetching register:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Single Date Attendance
router.get('/attendance/date/:stream/:semester/:subject/:date', async (req, res) => {
  try {
    const { stream, semester, subject, date } = req.params;
    const semesterNumber = parseInt(semester.replace('sem', ''));
    const queryDate = new Date(date);
    
    console.log('📅 [VIEW] Fetching attendance for date:', { stream, semester: semesterNumber, subject, date });
    
    // Get all students
    const students = await req.db.collection('students')
      .find({ 
        stream: { $regex: new RegExp(`^${stream}$`, 'i') },
        semester: semesterNumber, 
        isActive: true 
      })
      .project({ _id: 1, name: 1, studentID: 1, rollNumber: 1 })
      .sort({ studentID: 1 })
      .toArray();
    
    // Set date range
    const startOfDay = new Date(queryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(queryDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Get attendance records for this date
    const attendanceRecords = await Attendance.find({
      stream: { $regex: new RegExp(`^${stream}$`, 'i') },
      semester: semesterNumber,
      subject: { $regex: new RegExp(`^${subject}$`, 'i') },
      date: { $gte: startOfDay, $lt: endOfDay }
    })
    .sort({ time: 1 })
    .lean()
    .exec();
    
    console.log(`📊 [VIEW] Found ${attendanceRecords.length} sessions for this date`);
    
    if (attendanceRecords.length === 0) {
      return res.json({
        success: true,
        hasAttendance: false,
        message: 'No attendance records found for this date',
        students,
        sessions: []
      });
    }
    
    // Format sessions
    const sessions = attendanceRecords.map(record => ({
      _id: record._id,
      time: record.time,
      studentsPresent: record.studentsPresent,
      presentCount: record.presentCount,
      absentCount: record.absentCount
    }));
    
    // Build attendance data for each student
    const attendanceData = students.map(student => {
      const studentSessions = sessions.map(session => ({
        time: session.time,
        status: session.studentsPresent.includes(student.studentID) ? 'P' : 'A',
        sessionId: session._id
      }));
      
      return {
        studentID: student.studentID,
        name: student.name,
        rollNumber: student.rollNumber,
        sessions: studentSessions
      };
    });
    
    res.json({
      success: true,
      hasAttendance: true,
      date,
      stream,
      semester: semesterNumber,
      subject,
      students: attendanceData,
      sessions
    });
    
  } catch (error) {
    console.error('❌ [VIEW] Error fetching date attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Statistics
router.get('/attendance/stats/:stream/:semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const semesterNumber = parseInt(semester.replace('sem', ''));
    
    console.log('📊 [VIEW] Fetching stats for:', { stream, semester: semesterNumber });
    
    const cacheKey = getCacheKey('stats', { stream, semester: semesterNumber });
    let stats = getCache(cacheKey);
    
    if (!stats) {
      stats = await Attendance.aggregate([
        { 
          $match: { 
            stream: { $regex: new RegExp(`^${stream}$`, 'i') },
            semester: semesterNumber 
          } 
        },
        {
          $group: {
            _id: '$subject',
            totalClasses: { $sum: 1 },
            totalPresent: { $sum: '$presentCount' },
            totalAbsent: { $sum: '$absentCount' },
            avgAttendance: { $avg: { $divide: ['$presentCount', '$totalStudents'] } }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      
      setCache(cacheKey, stats);
    }
    
    res.json({ success: true, stats, stream, semester: semesterNumber });
  } catch (error) {
    console.error('❌ [VIEW] Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// UPDATE/DELETE ROUTES
// ============================================================================

// PUT - Update single session
router.put('/attendance/session/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { studentsPresent, totalStudents } = req.body;
    
    console.log('💾 [VIEW] Updating session:', id);
    console.log('📝 [VIEW] Students present:', studentsPresent.length, '/', totalStudents);
    
    if (!studentsPresent || !Array.isArray(studentsPresent)) {
      return res.status(400).json({ 
        success: false, 
        error: 'studentsPresent array required' 
      });
    }
    
    if (!totalStudents || totalStudents < 1) {
      return res.status(400).json({ 
        success: false, 
        error: 'totalStudents required' 
      });
    }
    
    const presentCount = studentsPresent.length;
    const absentCount = totalStudents - presentCount;
    
    const result = await Attendance.findByIdAndUpdate(
      id,
      {
        $set: {
          studentsPresent,
          presentCount,
          absentCount,
          totalStudents
        }
      },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ 
        success: false, 
        error: 'Session not found' 
      });
    }
    
    clearCachePattern(`attendance:${result.stream}`);
    clearCachePattern(`stats:${result.stream}`);
    
    console.log('✅ [VIEW] Session updated successfully');
    
    res.json({ 
      success: true,
      message: 'Session updated successfully',
      session: result
    });
    
  } catch (error) {
    console.error('❌ [VIEW] Error updating session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT - Bulk update attendance
router.put('/attendance/bulk/:stream/:semester/:subject/:date', async (req, res) => {
  try {
    const { stream, semester, subject, date } = req.params;
    const { updates } = req.body;
    
    console.log('💾 [VIEW] Bulk updating attendance:', { stream, semester, subject, date });
    console.log('📝 [VIEW] Updates:', updates?.length, 'sessions');
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Updates array required' 
      });
    }
    
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.sessionId },
        update: {
          $set: {
            studentsPresent: update.studentsPresent,
            presentCount: update.studentsPresent.length,
            absentCount: update.totalStudents - update.studentsPresent.length,
            totalStudents: update.totalStudents
          }
        }
      }
    }));
    
    const result = await Attendance.bulkWrite(bulkOps);
    
    clearCachePattern(`attendance:${stream}`);
    clearCachePattern(`stats:${stream}`);
    
    console.log('✅ [VIEW] Bulk update completed:', result.modifiedCount, 'records');
    
    res.json({ 
      success: true, 
      modified: result.modifiedCount,
      message: `Updated ${result.modifiedCount} attendance records`
    });
    
  } catch (error) {
    console.error('❌ [VIEW] Error bulk updating:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Remove attendance record
router.delete('/attendance/:id', async (req, res) => {
  try {
    console.log('🗑️ [VIEW] Deleting attendance:', req.params.id);
    
    const record = await Attendance.findByIdAndDelete(req.params.id).lean();
    
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    
    cache.delete(`attendance:single:${req.params.id}`);
    clearCachePattern(`attendance:${record.stream}`);
    clearCachePattern(`stats:${record.stream}`);
    
    console.log('✅ [VIEW] Attendance deleted:', req.params.id);
    
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('❌ [VIEW] Error deleting record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/attendance/health', (req, res) => {
  res.json({
    status: 'OK',
    module: 'View Attendance',
    cache: { size: cache.size, ttl: `${CACHE_TTL / 1000}s` },
    timestamp: new Date()
  });
});

module.exports = router;
