const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://ksa4sale-classified.firebaseio.com", // Optional for Firebase Realtime Database
});

const db = admin.firestore(); // Firestore initialization
const storage = admin.storage(); // Storage initialization (if you need it)

module.exports = { admin, db, storage };
