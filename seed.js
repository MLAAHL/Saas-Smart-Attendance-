// seed-teachers.js - Create teacher with empty fields
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://mlaahl:mlaahl123@cluster0.qo6wyfn.mongodb.net/Attendance?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'Attendance';

const teachers = [
  {
    firebaseUid: "yiB48zYHfcOCzyX5g4GHFgb6jeh1",  // Get this from Firebase Auth
    name: "UMESH SKANDA",
    email: "skandaumesh82@gmail.com",
    
    // Empty fields
    createdSubjects: [],
    attendanceQueue: [],
    completedClasses: [],
    
    lastQueueUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0
  }
];

const seed = async () => {
  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(DB_NAME);
  
  console.log('👨‍🏫 Creating teacher...');
  
  // Delete if exists
  await db.collection('teachers').deleteMany({ 
    email: "skandaumesh82@gmail.com"
  });
  
  console.log('💾 Inserting teacher...');
  await db.collection('teachers').insertMany(teachers);
  
  console.log('📑 Creating indexes...');
  try {
    await db.collection('teachers').createIndex({ firebaseUid: 1 }, { unique: true });
    await db.collection('teachers').createIndex({ email: 1 }, { unique: true });
    await db.collection('teachers').createIndex({ createdAt: -1 });
    console.log('✅ Indexes created');
  } catch (e) {
    console.log('✅ Indexes already exist');
  }
  
  console.log('\n✅ Done! Teacher added:');
  console.log('  • Email: skandaumesh82@gmail.com');
  console.log('  • Name: UMESH SKANDA');
  console.log('  • Subjects: Empty (ready to assign)');
  console.log('  • Attendance Queue: Empty');
  console.log('  • Completed Classes: Empty\n');
  
  await client.close();
};

seed();
