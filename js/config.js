// Application Configuration
// IMPORTANT: This file contains sensitive credentials - DO NOT commit to version control
// Copy from config.example.js and add your actual API keys

const APP_CONFIG = {
    // Admin Access Code - Required when signing up as admin
    // Change this to your own secure code
    adminAccessCode: process.env.ADMIN_ACCESS_CODE,

    // Gemini AI Configuration (Updated for 2025 API)
    gemini: {
        apiKey: process.env.GEMINI_API_KEY, // Get from https://aistudio.google.com/apikey
        model: process.env.Gemini_model_name // Options: 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'
        // Optional advanced settings:
        // baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        // maxOutputTokens: 8192,
        // temperature: 0.7
    },

    // Firebase Configuration (if not using firebase-config.js)
    // firebase: {
    //     apiKey: "your-api-key",
    //     authDomain: "your-project.firebaseapp.com",
    //     databaseURL: "https://your-project.firebaseio.com",
    //     projectId: "your-project-id",
    //     storageBucket: "your-project.appspot.com",
    //     messagingSenderId: "your-sender-id",
    //     appId: "your-app-id"
    // }
};

const firebase = {
    apiKey: process.env.Firebase_api_key,
    authDomain: process.env.Auth_domain,
    databaseURL: process.env.Database_url,
    projectId: process.env.Firebase_project_id,
    storageBucket: process.env.Storage_bucket,
    messagingSenderId: process.env.Messaging_sender_id,
    appId: process.env.App_id,
    measurementId: process.env.Measurement_id
  };

// Freeze config to prevent accidental modifications
Object.freeze(APP_CONFIG);
Object.freeze(APP_CONFIG.gemini);
