// ============================================================================
// teacherRoutes.js - Teacher Routes with Schema Validation (FIXED)
// ============================================================================

const express = require('express');
const router = express.Router();

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * Teacher Document Schema:
 * {
 *   _id: ObjectId,
 *   firebaseUid: String (unique, required),
 *   name: String,
 *   email: String (unique, required),
 *   createdSubjects: Array<SubjectSchema>,
 *   attendanceQueue: Array<QueueItemSchema>,
 *   completedClasses: Array<CompletedClassSchema>,
 *   createdAt: Date,
 *   updatedAt: Date,
 *   lastQueueUpdate: Date
 * }
 */

/**
 * SubjectSchema:
 * {
 *   id: String (timestamp-based unique ID),
 *   stream: String (e.g., "BCA", "BCOM"),
 *   semester: Number (1-6),
 *   subject: String (subject name),
 *   createdAt: String (ISO date),
 *   teacherEmail: String
 * }
 */

/**
 * QueueItemSchema:
 * {
 *   id: String (timestamp-based unique ID),
 *   stream: String,
 *   semester: Number,
 *   subject: String,
 *   addedAt: String (ISO date),
 *   teacherEmail: String
 * }
 */

/**
 * CompletedClassSchema:
 * {
 *   id: String (timestamp-based unique ID),
 *   stream: String,
 *   semester: Number,
 *   subject: String,
 *   completedAt: String (ISO date),
 *   teacherEmail: String
 * }
 */

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const validateSubject = (subject) => {
  if (!subject || typeof subject !== 'object') {
    throw new Error('Invalid subject object');
  }
  
  const required = ['id', 'stream', 'semester', 'subject', 'createdAt', 'teacherEmail'];
  const missing = required.filter(field => !subject[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  if (typeof subject.semester !== 'number' || subject.semester < 1 || subject.semester > 6) {
    throw new Error('Semester must be a number between 1 and 6');
  }
  
  return true;
};

const validateQueueItem = (item) => {
  if (!item || typeof item !== 'object') {
    throw new Error('Invalid queue item object');
  }
  
  const required = ['id', 'stream', 'semester', 'subject', 'addedAt'];
  const missing = required.filter(field => !item[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  return true;
};

const validateCompletedClass = (completed) => {
  if (!completed || typeof completed !== 'object') {
    throw new Error('Invalid completed class object');
  }
  
  const required = ['id', 'stream', 'semester', 'subject', 'completedAt'];
  const missing = required.filter(field => !completed[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  return true;
};

// ============================================================================
// HELPER FUNCTION - ENSURE TEACHER HAS ALL FIELDS
// ============================================================================

const ensureTeacherFields = async (db, email) => {
  try {
    const result = await db.collection('teachers').updateOne(
      { email },
      {
        $setOnInsert: {
          createdSubjects: [],
          attendanceQueue: [],
          completedClasses: [],
          createdAt: new Date()
        }
      },
      { upsert: false }
    );
    
    // If document exists but missing fields, add them
    await db.collection('teachers').updateOne(
      { 
        email,
        $or: [
          { createdSubjects: { $exists: false } },
          { attendanceQueue: { $exists: false } },
          { completedClasses: { $exists: false } }
        ]
      },
      {
        $set: {
          createdSubjects: [],
          attendanceQueue: [],
          completedClasses: []
        }
      }
    );
    
    return true;
  } catch (error) {
    console.error('❌ Error ensuring teacher fields:', error);
    return false;
  }
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

const checkDB = (req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  
  if (!db) {
    console.error('❌ [TEACHER] Database not available');
    return res.status(503).json({ 
      success: false, 
      error: 'Database connection not available' 
    });
  }
  
  req.db = db;
  next();
};

router.use(checkDB);

router.use((req, res, next) => {
  console.log(`📡 [TEACHER] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// TEACHER PROFILE ROUTES
// ============================================================================

// POST - Create or update teacher profile
router.post('/profile', async (req, res) => {
  try {
    const { firebaseUid, name, email } = req.body;
    
    if (!firebaseUid) {
      return res.status(400).json({ 
        success: false, 
        error: 'Firebase UID is required' 
      });
    }
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required' 
      });
    }
    
    console.log('👤 [TEACHER] Creating/updating profile for:', email);
    
    const teacherData = {
      firebaseUid,
      name: name || email.split('@')[0],
      email,
      updatedAt: new Date()
    };
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      { email }, // ✅ Match by email for consistency
      { 
        $set: teacherData,
        $setOnInsert: { 
          createdSubjects: [],
          attendanceQueue: [],
          completedClasses: [],
          createdAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
    
    // ✅ Ensure all fields exist
    await ensureTeacherFields(req.db, email);
    
    // ✅ Fetch updated document
    const updatedTeacher = await req.db.collection('teachers').findOne({ email });
    
    console.log('✅ [TEACHER] Profile saved');
    res.json({ success: true, teacher: updatedTeacher });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error saving profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Teacher profile by Firebase UID
router.get('/profile/:firebaseUid', async (req, res) => {
  try {
    console.log('🔍 [TEACHER] Fetching profile by UID:', req.params.firebaseUid);
    
    const teacher = await req.db.collection('teachers').findOne({ 
      firebaseUid: req.params.firebaseUid 
    });
    
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }
    
    console.log('✅ [TEACHER] Found:', teacher.email);
    res.json({ success: true, teacher });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error fetching profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Teacher profile by email
router.get('/profile/email/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    console.log('🔍 [TEACHER] Fetching profile by email:', email);
    
    const teacher = await req.db.collection('teachers').findOne({ email });
    
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }
    
    console.log('✅ [TEACHER] Found');
    res.json({ success: true, teacher });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error fetching profile:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TEACHER SUBJECTS ROUTES
// ============================================================================

// GET - Teacher's subjects
router.get('/subjects', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }
    
    console.log('📚 [TEACHER] Getting subjects for email:', email);
    
    // ✅ Ensure fields exist first
    await ensureTeacherFields(req.db, email);
    
    const teacher = await req.db.collection('teachers').findOne({ email });
    
    if (!teacher) {
      console.log('⚠️ [TEACHER] Teacher not found, returning empty subjects');
      return res.json({ 
        success: true, 
        subjects: [] 
      });
    }
    
    const subjects = teacher.createdSubjects || [];
    console.log(`✅ [TEACHER] Found ${subjects.length} subjects`);
    
    res.json({ 
      success: true, 
      subjects: subjects 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error getting subjects:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST - Add subject to teacher's created subjects
router.post('/subjects', async (req, res) => {
  try {
    const { teacherEmail, subject } = req.body;
    
    if (!teacherEmail || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email and subject are required'
      });
    }
    
    // Validate subject schema
    try {
      validateSubject(subject);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationError.message}`
      });
    }
    
    console.log('📚 [TEACHER] Adding subject for:', teacherEmail);
    
    // ✅ Ensure fields exist first
    await ensureTeacherFields(req.db, teacherEmail);
    
    // Check for duplicates
    const teacher = await req.db.collection('teachers').findOne({ email: teacherEmail });
    if (teacher) {
      const exists = teacher.createdSubjects?.some(s => 
        s.stream === subject.stream && 
        s.semester === subject.semester && 
        s.subject === subject.subject
      );
      
      if (exists) {
        return res.status(409).json({
          success: false,
          error: 'Subject already exists'
        });
      }
    }
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      { email: teacherEmail },
      { 
        $push: { createdSubjects: subject },
        $set: { updatedAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );
    
    console.log('✅ [TEACHER] Subject added successfully');
    res.json({ 
      success: true, 
      teacher: result.value 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error adding subject:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE - Remove subject
router.delete('/subjects/:subjectId', async (req, res) => {
  try {
    const { teacherEmail } = req.body;
    const { subjectId } = req.params;
    
    if (!teacherEmail) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }
    
    console.log('🗑️ [TEACHER] Deleting subject:', subjectId);
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      { email: teacherEmail },
      { 
        $pull: { createdSubjects: { id: subjectId } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    
    if (!result.value) {
      return res.status(404).json({ 
        success: false, 
        error: 'Teacher not found' 
      });
    }
    
    console.log('✅ [TEACHER] Subject deleted');
    res.json({ 
      success: true, 
      teacher: result.value 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error deleting subject:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================================
// QUEUE ROUTES
// ============================================================================

// POST - Save queue
router.post('/queue', async (req, res) => {
  try {
    const { teacherEmail, queueData } = req.body;
    
    if (!teacherEmail) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }
    
    if (!Array.isArray(queueData)) {
      return res.status(400).json({
        success: false,
        error: 'Queue data must be an array'
      });
    }
    
    // Validate each queue item
    try {
      queueData.forEach(item => validateQueueItem(item));
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationError.message}`
      });
    }
    
    console.log('📝 [TEACHER] Saving queue for:', teacherEmail);
    
    // ✅ Ensure fields exist first
    await ensureTeacherFields(req.db, teacherEmail);
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      { email: teacherEmail },
      { 
        $set: { 
          attendanceQueue: queueData,
          lastQueueUpdate: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
    
    console.log('✅ [TEACHER] Queue saved');
    res.json({ 
      success: true, 
      teacher: result.value 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error saving queue:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET - Load queue
router.get('/queue', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }
    
    console.log('📥 [TEACHER] Loading queue for:', email);
    
    // ✅ Ensure fields exist first
    await ensureTeacherFields(req.db, email);
    
    const teacher = await req.db.collection('teachers').findOne({ email });
    
    if (!teacher) {
      console.log('⚠️ [TEACHER] Teacher not found, returning empty queue');
      return res.json({ 
        success: true, 
        queueData: [] 
      });
    }
    
    const queue = teacher.attendanceQueue || [];
    console.log(`✅ [TEACHER] Queue loaded: ${queue.length} items`);
    
    res.json({ 
      success: true, 
      queueData: queue 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error loading queue:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE - Remove queue item
router.delete('/queue/:itemId', async (req, res) => {
  try {
    const { teacherEmail } = req.body;
    const { itemId } = req.params;
    
    if (!teacherEmail) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }
    
    console.log('🗑️ [TEACHER] Deleting queue item:', itemId);
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      { email: teacherEmail },
      { 
        $pull: { attendanceQueue: { id: itemId } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    
    if (!result.value) {
      return res.status(404).json({ 
        success: false, 
        error: 'Teacher not found' 
      });
    }
    
    console.log('✅ [TEACHER] Queue item deleted');
    res.json({ 
      success: true, 
      teacher: result.value 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error deleting queue item:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================================
// COMPLETED CLASSES ROUTES
// ============================================================================

// POST - Save completed class
router.post('/completed', async (req, res) => {
  try {
    const { teacherEmail, completedClass } = req.body;
    
    if (!teacherEmail) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }
    
    // Validate completed class schema
    try {
      validateCompletedClass(completedClass);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationError.message}`
      });
    }
    
    console.log('✅ [TEACHER] Saving completed class for:', teacherEmail);
    
    // ✅ Ensure fields exist first
    await ensureTeacherFields(req.db, teacherEmail);
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      { email: teacherEmail },
      { 
        $push: { completedClasses: completedClass },
        $set: { updatedAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );
    
    console.log('✅ [TEACHER] Completed class saved');
    res.json({ 
      success: true, 
      teacher: result.value 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error saving completed class:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET - Get completed classes
router.get('/completed', async (req, res) => {
  try {
    const { email, limit } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }
    
    console.log('📊 [TEACHER] Getting completed classes for:', email);
    
    // ✅ Ensure fields exist first
    await ensureTeacherFields(req.db, email);
    
    const teacher = await req.db.collection('teachers').findOne({ email });
    
    if (!teacher) {
      console.log('⚠️ [TEACHER] Teacher not found, returning empty list');
      return res.json({ 
        success: true, 
        completedClasses: [] 
      });
    }
    
    let completed = teacher.completedClasses || [];
    
    // Sort by completion date (newest first)
    completed = completed.sort((a, b) => 
      new Date(b.completedAt) - new Date(a.completedAt)
    );
    
    // Apply limit if specified
    if (limit && !isNaN(limit)) {
      completed = completed.slice(0, parseInt(limit));
    }
    
    console.log(`✅ [TEACHER] Found ${completed.length} completed classes`);
    
    res.json({ 
      success: true, 
      completedClasses: completed 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error getting completed classes:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE - Remove completed class
router.delete('/completed/:completedId', async (req, res) => {
  try {
    const { teacherEmail } = req.body;
    const { completedId } = req.params;
    
    if (!teacherEmail) {
      return res.status(400).json({
        success: false,
        error: 'Teacher email is required'
      });
    }
    
    console.log('🗑️ [TEACHER] Deleting completed class:', completedId);
    
    const result = await req.db.collection('teachers').findOneAndUpdate(
      { email: teacherEmail },
      { 
        $pull: { completedClasses: { id: completedId } },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    
    if (!result.value) {
      return res.status(404).json({ 
        success: false, 
        error: 'Teacher not found' 
      });
    }
    
    console.log('✅ [TEACHER] Completed class deleted');
    res.json({ 
      success: true, 
      teacher: result.value 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error deleting completed class:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET - Get statistics
router.get('/stats/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    console.log('📊 [TEACHER] Getting stats for:', email);
    
    const teacher = await req.db.collection('teachers').findOne({ email });
    
    if (!teacher) {
      return res.status(404).json({ 
        success: false, 
        error: 'Teacher not found' 
      });
    }
    
    const stats = {
      totalSubjects: (teacher.createdSubjects || []).length,
      queueLength: (teacher.attendanceQueue || []).length,
      completedClasses: (teacher.completedClasses || []).length,
      lastActive: teacher.updatedAt
    };
    
    console.log('✅ [TEACHER] Stats retrieved');
    res.json({ 
      success: true, 
      stats 
    });
    
  } catch (error) {
    console.error('❌ [TEACHER] Error getting stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================================================
// EXPORT ROUTER
// ============================================================================

module.exports = router;
