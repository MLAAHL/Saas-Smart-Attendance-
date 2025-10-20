// attendanceRoutes.js - Production-Ready Attendance System (No Email)
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ============================================================================
// SCHEMA - SIMPLIFIED WITHOUT EMAIL
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

// Optimized indexes
attendanceSchema.index({ stream: 1, semester: 1, subject: 1, date: -1 }, { background: true });
attendanceSchema.index({ date: -1, stream: 1 }, { background: true });
attendanceSchema.index({ createdAt: -1 }, { background: true });

// Pre-save hook
attendanceSchema.pre('save', function(next) {
  if (!this.presentCount) this.presentCount = this.studentsPresent.length;
  if (!this.absentCount) this.absentCount = this.totalStudents - this.presentCount;
  next();
});

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

// ============================================================================
// CACHING SYSTEM
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

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT = 100;
const RATE_WINDOW = 60000;

router.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const userRequests = requestCounts.get(ip) || { count: 0, resetTime: now + RATE_WINDOW };
  
  if (now > userRequests.resetTime) {
    userRequests.count = 0;
    userRequests.resetTime = now + RATE_WINDOW;
  }
  
  userRequests.count++;
  requestCounts.set(ip, userRequests);
  
  if (userRequests.count > RATE_LIMIT) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded' });
  }
  
  next();
});

// ============================================================================
// ATTENDANCE ROUTES
// ============================================================================

// POST - Submit attendance (detailed)
router.post('/attendance/:stream/:semester/:subject', async (req, res) => {
  try {
    const { stream, semester, subject } = req.params;
    const { date, time, studentsPresent, totalStudents, presentCount, absentCount } = req.body;
    const semesterNumber = parseInt(semester.replace('sem', ''));
    
    if (!date || !time || !studentsPresent || totalStudents === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: date, time, studentsPresent, totalStudents' 
      });
    }
    
    const saved = await new Attendance({
      stream, 
      semester: semesterNumber, 
      subject, 
      date: new Date(date), 
      time,
      studentsPresent, 
      totalStudents,
      presentCount: presentCount || studentsPresent.length,
      absentCount: absentCount || (totalStudents - studentsPresent.length)
    }).save();
    
    clearCachePattern(`attendance:${stream}`);
    clearCachePattern(`stats:${stream}`);
    
    console.log('✅ Attendance saved:', saved._id);
    res.json({ success: true, attendanceId: saved._id });
    
  } catch (error) {
    console.error('❌ Error saving attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Simple submit
router.post('/attendance', async (req, res) => {
  try {
    const { date, time, subject, studentsPresent, totalStudents, stream, semester, presentCount, absentCount } = req.body;
    
    if (!date || !time || !subject || !studentsPresent || totalStudents === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: date, time, subject, studentsPresent, totalStudents' 
      });
    }
    
    const saved = await new Attendance({
      stream: stream || 'General', 
      semester: semester || 1, 
      subject,
      date: new Date(date), 
      time,
      studentsPresent, 
      totalStudents,
      presentCount: presentCount || studentsPresent.length,
      absentCount: absentCount || (totalStudents - studentsPresent.length)
    }).save();
    
    clearCachePattern(`attendance:${stream || 'General'}`);
    
    console.log('✅ Attendance saved:', saved._id);
    res.json({ success: true, attendanceId: saved._id });
    
  } catch (error) {
    console.error('❌ Error saving attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// GET - Students for attendance (SMART DETECTION via Subjects Collection)
router.get('/attendance-students/:stream/:semester/:subject', async (req, res) => {
    try {
      const { stream, semester, subject } = req.params;
      const semesterNumber = parseInt(semester.replace('sem', ''));
      
      console.log('📥 Fetching students:', { stream, semester: semesterNumber, subject });
      
      // Build base query for students
      const query = { 
        stream, 
        semester: semesterNumber, 
        isActive: true 
      };
      
      // ✅ STEP 1: Check subjects collection to determine subject type
      try {
        const subjectDoc = await req.db.collection('subjects').findOne({
          name: subject,
          stream,
          semester: semesterNumber,
          isActive: true
        });
        
        if (subjectDoc) {
          console.log('📚 Subject found:', {
            name: subjectDoc.name,
            type: subjectDoc.subjectType,
            isLanguage: subjectDoc.isLanguageSubject
          });
          
          // ✅ STEP 2: Filter based on subject type
          if (subjectDoc.isLanguageSubject === true) {
            // It's a language subject - filter by languageSubject field
            const languageName = subjectDoc.name.toUpperCase();
            query.languageSubject = languageName;
            console.log(`🔍 Language Filter: ${languageName}`);
          } 
          else if (subjectDoc.subjectType === 'ELECTIVE') {
            // It's an elective - filter by electiveSubject field
            const electiveName = subjectDoc.name;
            query.electiveSubject = electiveName;
            console.log(`🔍 Elective Filter: ${electiveName}`);
          }
          else {
            console.log('✅ Core subject - showing all students');
          }
        } else {
          console.log('⚠️ Subject not found in subjects collection, showing all students');
        }
      } catch (err) {
        console.warn('⚠️ Error checking subject type:', err);
      }
      
      // ✅ STEP 3: Fetch students with the built query
      const students = await req.db.collection('students')
        .find(query)
        .project({ 
          _id: 1, 
          name: 1, 
          studentID: 1, 
          rollNumber: 1,
          languageSubject: 1,
          electiveSubject: 1,
          parentPhone: 1
        })
        .sort({ studentID: 1 })
        .toArray();
      
      console.log(`✅ Query used:`, query);
      console.log(`✅ Found ${students.length} students`);
      
      res.json({ 
        success: true, 
        students, 
        count: students.length,
        filterApplied: query.languageSubject ? 'language' : (query.electiveSubject ? 'elective' : 'none')
      });
      
    } catch (error) {
      console.error('❌ Error fetching students:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  

// GET - All attendance records
router.get('/attendance', async (req, res) => {
  try {
    const { stream, semester, subject, date, time, startDate, endDate, limit = 50, page = 1 } = req.query;
    
    const cacheKey = getCacheKey('attendance', { stream, semester, subject, date, time, page, limit });
    let result = getCache(cacheKey);
    
    if (!result) {
      const query = {};
      if (stream) query.stream = stream;
      if (semester) query.semester = parseInt(semester);
      if (subject) query.subject = subject;
      if (date) query.date = new Date(date);
      if (time) query.time = time;
      if (startDate && endDate) query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [records, total] = await Promise.all([
        Attendance.find(query)
          .select('-studentsPresent')
          .sort({ createdAt: -1 })
          .limit(parseInt(limit))
          .skip(skip)
          .lean()
          .exec(),
        Attendance.countDocuments(query)
      ]);
      
      result = { 
        success: true, 
        records, 
        count: records.length, 
        total, 
        page: parseInt(page), 
        totalPages: Math.ceil(total / parseInt(limit)) 
      };
      
      setCache(cacheKey, result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching attendance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Single record
router.get('/attendance/:id', async (req, res) => {
  try {
    const cacheKey = `attendance:single:${req.params.id}`;
    let record = getCache(cacheKey);
    
    if (!record) {
      record = await Attendance.findById(req.params.id).lean();
      if (record) setCache(cacheKey, record);
    }
    
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    res.json({ success: true, record });
  } catch (error) {
    console.error('❌ Error fetching record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT - Update record
router.put('/attendance/:id', async (req, res) => {
  try {
    const record = await Attendance.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true, runValidators: true }
    ).lean();
    
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    
    cache.delete(`attendance:single:${req.params.id}`);
    clearCachePattern(`attendance:${record.stream}`);
    
    res.json({ success: true, record });
  } catch (error) {
    console.error('❌ Error updating record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Remove record
router.delete('/attendance/:id', async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id).lean();
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    
    cache.delete(`attendance:single:${req.params.id}`);
    clearCachePattern(`attendance:${record.stream}`);
    
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting record:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Statistics
router.get('/attendance/stats/:stream/:semester', async (req, res) => {
  try {
    const { stream, semester } = req.params;
    const semesterNumber = parseInt(semester.replace('sem', ''));
    
    const cacheKey = getCacheKey('stats', { stream, semester: semesterNumber });
    let stats = getCache(cacheKey);
    
    if (!stats) {
      stats = await Attendance.aggregate([
        { $match: { stream, semester: semesterNumber } },
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
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// QUEUE ROUTES
// ============================================================================

router.post('/queue', async (req, res) => {
  try {
    const { teacherId, firebaseUid, queueData, timestamp } = req.body;
    const query = firebaseUid ? { firebaseUid } : { email: teacherId };
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      query,
      { 
        $set: { 
          attendanceQueue: queueData,
          lastQueueUpdate: new Date(timestamp || Date.now()),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after', upsert: true }
    );
    
    res.json({ success: true, teacher: result.value });
  } catch (error) {
    console.error('❌ Error saving queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/queue/:identifier', async (req, res) => {
  try {
    const identifier = decodeURIComponent(req.params.identifier);
    let teacher = await req.db.collection('teachers').findOne({ firebaseUid: identifier });
    
    if (!teacher) {
      teacher = await req.db.collection('teachers').findOne({ email: identifier });
    }
    
    res.json({ 
      success: true, 
      queueData: teacher?.attendanceQueue || [] 
    });
  } catch (error) {
    console.error('❌ Error loading queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/queue/item/:itemId', async (req, res) => {
  try {
    const { teacherId, firebaseUid } = req.body;
    const itemId = parseFloat(req.params.itemId);
    const query = firebaseUid ? { firebaseUid } : { email: teacherId };
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      query,
      { 
        $pull: { attendanceQueue: { id: itemId } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    
    if (!result.value) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }
    
    res.json({ success: true, teacher: result.value });
  } catch (error) {
    console.error('❌ Error deleting queue item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/attendance/health', (req, res) => {
  res.json({
    status: 'OK',
    cache: { size: cache.size, ttl: `${CACHE_TTL / 1000}s` },
    uptime: Math.round(process.uptime()),
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
  });
});
// GET - Attendance Register (Full Register Book View)
router.get('/attendance/register/:stream/:semester/:subject', async (req, res) => {
    try {
      const { stream, semester, subject } = req.params;
      const semesterNumber = parseInt(semester.replace('sem', ''));
      
      console.log('📚 Fetching register for:', { stream, semester: semesterNumber, subject });
      
      // Get all students for this class
      const students = await req.db.collection('students')
        .find({ 
          stream, 
          semester: semesterNumber, 
          isActive: true 
        })
        .project({ 
          _id: 1, 
          name: 1, 
          studentID: 1, 
          rollNumber: 1 
        })
        .sort({ studentID: 1 })
        .toArray();
      
      // Get all attendance records for this subject
      const attendanceRecords = await Attendance.find({
        stream,
        semester: semesterNumber,
        subject
      })
      .sort({ date: 1, time: 1 })
      .lean()
      .exec();
      
      // Group attendance by date and time
      const sessions = attendanceRecords.map(record => ({
        _id: record._id,
        date: record.date,
        time: record.time,
        studentsPresent: record.studentsPresent,
        totalStudents: record.totalStudents,
        presentCount: record.presentCount,
        absentCount: record.absentCount
      }));
      
      // Calculate statistics
      const totalSessions = sessions.length;
      const totalPossibleAttendances = totalSessions * students.length;
      
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
          totalPossibleAttendances,
          averageAttendance: registerData.length > 0
            ? (registerData.reduce((sum, s) => sum + parseFloat(s.attendancePercentage), 0) / registerData.length).toFixed(2)
            : 0
        }
      });
      
    } catch (error) {
      console.error('❌ Error fetching register:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // GET - Single Date Attendance
  router.get('/attendance/date/:stream/:semester/:subject/:date', async (req, res) => {
    try {
      const { stream, semester, subject, date } = req.params;
      const semesterNumber = parseInt(semester.replace('sem', ''));
      const queryDate = new Date(date);
      
      console.log('📅 Fetching attendance for date:', { stream, semester: semesterNumber, subject, date });
      
      // Get all students
      const students = await req.db.collection('students')
        .find({ 
          stream, 
          semester: semesterNumber, 
          isActive: true 
        })
        .project({ 
          _id: 1, 
          name: 1, 
          studentID: 1, 
          rollNumber: 1 
        })
        .sort({ studentID: 1 })
        .toArray();
      
      // Get attendance records for this date
      const attendanceRecords = await Attendance.find({
        stream,
        semester: semesterNumber,
        subject,
        date: {
          $gte: new Date(queryDate.setHours(0, 0, 0, 0)),
          $lt: new Date(queryDate.setHours(23, 59, 59, 999))
        }
      })
      .sort({ time: 1 })
      .lean()
      .exec();
      
      if (attendanceRecords.length === 0) {
        return res.json({
          success: true,
          hasAttendance: false,
          message: 'No attendance records found for this date',
          students,
          sessions: []
        });
      }
      
      // Format response
      const sessions = attendanceRecords.map(record => ({
        _id: record._id,
        time: record.time,
        studentsPresent: record.studentsPresent,
        presentCount: record.presentCount,
        absentCount: record.absentCount
      }));
      
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
      console.error('❌ Error fetching date attendance:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
module.exports = router;
