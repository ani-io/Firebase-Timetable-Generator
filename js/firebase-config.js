// Firebase Configuration
// Replace these placeholder values with your Firebase project credentials

// const firebaseConfig = {
//     apiKey: "YOUR_API_KEY",
//     authDomain: "YOUR_PROJECT.firebaseapp.com",
//     databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
//     projectId: "YOUR_PROJECT_ID",
//     storageBucket: "YOUR_PROJECT.appspot.com",
//     messagingSenderId: "YOUR_SENDER_ID",
//     appId: "YOUR_APP_ID"
// };

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyADVLcL2SJjFgdmsyFSi04WxjuicyVU-zY",
    authDomain: "time-table-maker-501e2.firebaseapp.com",
    databaseURL: "https://time-table-maker-501e2-default-rtdb.firebaseio.com",
    projectId: "time-table-maker-501e2",
    storageBucket: "time-table-maker-501e2.firebasestorage.app",
    messagingSenderId: "272337198586",
    appId: "1:272337198586:web:b6084b791b950623f5d843",
    measurementId: "G-715LBPXP5F"
  };

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase app initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
}

// Get references to Firebase services
const auth = firebase.auth();
const database = firebase.database();

// Verify database initialization
if (!database) {
    console.error('Firebase Realtime Database failed to initialize!');
} else {
    console.log('Firebase services ready:', {
        auth: !!auth,
        database: !!database,
        databaseURL: firebaseConfig.databaseURL
    });
}

// Test database connection
database.ref('.info/connected').on('value', (snapshot) => {
    if (snapshot.val() === true) {
        console.log('Connected to Firebase Realtime Database');
    } else {
        console.warn('Disconnected from Firebase Realtime Database');
    }
});

// Export for use in other modules
window.auth = auth;
window.database = database;
