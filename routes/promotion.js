// ============================================================================
// STUDENT PROMOTION SYSTEM - FIXED CONNECTION MANAGEMENT
// ============================================================================

const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;

// ✅ FIX: Create new client for each route OR use connection pooling
async function getDatabase() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  return { client, db: client.db() };
}

// ============================================================================
// 1. GET ALL STREAMS
// ============================================================================
router.get('/api/streams', async (req, res) => {
  let client;
  try {
    const connection = await getDatabase();
    client = connection.client;
    const db = connection.db;
    
    const streamsCollection = db.collection('streams');
    const streams = await streamsCollection.find({ isActive: true }).toArray();
    
    const formattedStreams = streams.map(stream => ({
      streamCode: stream.streamCode,
      name: stream.name,
      fullName: stream.name,
      semesters: stream.semesters
    }));
    
    res.json({
      success: true,
      streams: formattedStreams
    });
    
  } catch (error) {
    console.error('Error fetching streams:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching streams from database',
      error: error.message
    });
  } finally {
    if (client) await client.close();
  }
});

// ============================================================================
// 2. GET PROMOTION PREVIEW
// ============================================================================
router.get('/api/simple-promotion-preview/:stream', async (req, res) => {
  let client;
  try {
    const streamName = req.params.stream;
    const connection = await getDatabase();
    client = connection.client;
    const db = connection.db;
    
    const streamsCollection = db.collection('streams');
    const streamData = await streamsCollection.findOne({ 
      $or: [
        { name: streamName },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const studentsCollection = db.collection('students');
    
    const semesterBreakdown = {};
    let totalStudents = 0;
    
    for (let sem = 1; sem <= 6; sem++) {
      const count = await studentsCollection.countDocuments({ 
        stream: streamData.name,
        semester: sem 
      });
      semesterBreakdown[`semester${sem}`] = count;
      totalStudents += count;
    }
    
    const promotionPreview = [
      `Sem 1 → Sem 2 (${semesterBreakdown.semester1} students)`,
      `Sem 2 → Sem 3 (${semesterBreakdown.semester2} students)`,
      `Sem 3 → Sem 4 (${semesterBreakdown.semester3} students)`,
      `Sem 4 → Sem 5 (${semesterBreakdown.semester4} students)`,
      `Sem 5 → Sem 6 (${semesterBreakdown.semester5} students)`,
      `Sem 6 → Graduate (${semesterBreakdown.semester6} students)`
    ];
    
    res.json({
      success: true,
      stream: streamData.name,
      totalStudents: totalStudents,
      semesterBreakdown: semesterBreakdown,
      promotionPreview: promotionPreview
    });
    
  } catch (error) {
    console.error('Error getting promotion preview:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting promotion preview',
      error: error.message
    });
  } finally {
    if (client) await client.close();
  }
});

// ============================================================================
// 3. EXECUTE PROMOTION - WITH BACKUP
// ============================================================================
router.post('/api/simple-promotion/:stream', async (req, res) => {
  let client;
  try {
    const streamName = req.params.stream;
    const connection = await getDatabase();
    client = connection.client;
    const db = connection.db;
    
    const streamsCollection = db.collection('streams');
    const streamData = await streamsCollection.findOne({ 
      $or: [
        { name: streamName },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const studentsCollection = db.collection('students');
    
    // ✅ CREATE BACKUP BEFORE PROMOTION
    const allStudents = await studentsCollection
      .find({ stream: streamData.name })
      .toArray();
    
    const promotionHistoryCollection = db.collection('promotion_history');
    await promotionHistoryCollection.insertOne({
      stream: streamData.name,
      timestamp: new Date(),
      students: allStudents,
      totalStudents: allStudents.length,
      restored: false
    });
    
    console.log(`💾 Backup created: ${allStudents.length} students`);
    
    let totalPromoted = 0;
    let totalGraduated = 0;
    const promotionFlow = [];
    
    // Graduate Semester 6 students
    const deleteResult = await studentsCollection.deleteMany({ 
      stream: streamData.name,
      semester: 6 
    });
    
    if (deleteResult.deletedCount > 0) {
      totalGraduated = deleteResult.deletedCount;
      promotionFlow.push(`✅ Graduated ${deleteResult.deletedCount} students from Semester 6`);
    }
    
    // Promote all other semesters
    for (let currentSem = 5; currentSem >= 1; currentSem--) {
      const nextSem = currentSem + 1;
      
      const updateResult = await studentsCollection.updateMany(
        { 
          stream: streamData.name,
          semester: currentSem 
        },
        { 
          $set: { 
            semester: nextSem,
            updatedAt: new Date()
          }
        }
      );
      
      if (updateResult.modifiedCount > 0) {
        totalPromoted += updateResult.modifiedCount;
        promotionFlow.push(`✅ Promoted ${updateResult.modifiedCount} students: Sem ${currentSem} → Sem ${nextSem}`);
      }
    }
    
    res.json({
      success: true,
      stream: streamData.name,
      totalPromoted: totalPromoted,
      totalGraduated: totalGraduated,
      promotionFlow: promotionFlow,
      backupCreated: true,
      note: 'Semester 1 is now empty and ready for new admissions. You can undo this within 24 hours.'
    });
    
  } catch (error) {
    console.error('Error executing promotion:', error);
    res.status(500).json({
      success: false,
      message: 'Error executing promotion',
      error: error.message
    });
  } finally {
    if (client) await client.close();
  }
});

// ============================================================================
// 4. CHECK IF UNDO IS AVAILABLE
// ============================================================================
router.get('/api/can-undo-promotion/:stream', async (req, res) => {
  console.log(`📡 GET /api/can-undo-promotion/${req.params.stream}`);
  
  let client;
  try {
    const streamName = req.params.stream;
    const connection = await getDatabase();
    client = connection.client;
    const db = connection.db;
    
    const streamsCollection = db.collection('streams');
    const streamData = await streamsCollection.findOne({ 
      $or: [
        { name: new RegExp(`^${streamName}$`, 'i') },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const promotionHistoryCollection = db.collection('promotion_history');
    
    const latestBackupArray = await promotionHistoryCollection
      .find({ 
        stream: streamData.name,
        restored: { $ne: true }
      })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    if (latestBackupArray.length === 0) {
      return res.json({
        success: true,
        canUndo: false,
        message: 'No backup available'
      });
    }
    
    const latestBackup = latestBackupArray[0];
    
    const backupAge = Date.now() - new Date(latestBackup.timestamp).getTime();
    const hoursOld = Math.floor(backupAge / (1000 * 60 * 60));
    const canUndo = hoursOld <= 24;
    
    res.json({
      success: true,
      canUndo: canUndo,
      backupTimestamp: latestBackup.timestamp,
      hoursOld: hoursOld,
      studentsInBackup: latestBackup.students ? latestBackup.students.length : 0
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) await client.close();
  }
});

// ============================================================================
// 5. UNDO PROMOTION
// ============================================================================
router.post('/api/undo-promotion/:stream', async (req, res) => {
  console.log(`📡 POST /api/undo-promotion/${req.params.stream}`);
  
  let client;
  try {
    const streamName = req.params.stream;
    const connection = await getDatabase();
    client = connection.client;
    const db = connection.db;
    
    const streamsCollection = db.collection('streams');
    const streamData = await streamsCollection.findOne({ 
      $or: [
        { name: new RegExp(`^${streamName}$`, 'i') },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const promotionHistoryCollection = db.collection('promotion_history');
    
    const latestBackupArray = await promotionHistoryCollection
      .find({ stream: streamData.name })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    if (latestBackupArray.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No backup found. Cannot undo promotion.'
      });
    }
    
    const latestBackup = latestBackupArray[0];
    
    const backupAge = Date.now() - new Date(latestBackup.timestamp).getTime();
    const hoursOld = Math.floor(backupAge / (1000 * 60 * 60));
    
    if (hoursOld > 24) {
      return res.status(400).json({
        success: false,
        message: `Backup is ${hoursOld} hours old. Undo only available within 24 hours.`
      });
    }
    
    const studentsCollection = db.collection('students');
    
    await studentsCollection.deleteMany({ stream: streamData.name });
    
    if (latestBackup.students && latestBackup.students.length > 0) {
      const studentsToInsert = latestBackup.students.map(student => {
        const { _id, ...studentWithoutId } = student;
        return studentWithoutId;
      });
      
      await studentsCollection.insertMany(studentsToInsert);
    }
    
    await promotionHistoryCollection.updateOne(
      { _id: latestBackup._id },
      { $set: { restored: true, restoredAt: new Date() } }
    );
    
    res.json({
      success: true,
      stream: streamData.name,
      studentsRestored: latestBackup.students ? latestBackup.students.length : 0,
      backupTimestamp: latestBackup.timestamp,
      message: 'Promotion successfully undone'
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (client) await client.close();
  }
});

// ============================================================================
// 6. ADD STUDENT TO SEMESTER 1
// ============================================================================
router.post('/api/add-student/:stream/sem1', async (req, res) => {
  let client;
  try {
    const streamName = req.params.stream;
    const { studentID, name, parentPhone } = req.body;
    
    if (!studentID || !name || !parentPhone) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: studentID, name, parentPhone'
      });
    }
    
    const connection = await getDatabase();
    client = connection.client;
    const db = connection.db;
    
    const streamsCollection = db.collection('streams');
    const streamData = await streamsCollection.findOne({ 
      $or: [
        { name: streamName },
        { streamCode: streamName.toLowerCase() }
      ]
    });
    
    if (!streamData) {
      return res.status(404).json({
        success: false,
        message: `Stream ${streamName} not found`
      });
    }
    
    const studentsCollection = db.collection('students');
    
    const existing = await studentsCollection.findOne({ studentID: studentID });
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Student ${studentID} already exists`
      });
    }
    
    const newStudent = {
      studentID: studentID,
      name: name,
      stream: streamData.name,
      semester: 1,
      parentPhone: parentPhone,
      languageSubject: "",
      electiveSubject: "",
      isActive: true,
      academicYear: new Date().getFullYear(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await studentsCollection.insertOne(newStudent);
    
    res.json({
      success: true,
      message: `Student ${studentID} added to ${streamData.name} Semester 1`,
      student: newStudent,
      insertedId: result.insertedId
    });
    
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding student',
      error: error.message
    });
  } finally {
    if (client) await client.close();
  }
});

module.exports = router;
