// ============================================================
// Paste your own values here.
// Firebase console > Project settings (gear icon) > General > Your apps > Web app > Config
// These values are not secret; they only say which Firebase project to use.
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAgjS3hEW-XcJ4vEWGKk9L3RPIiHbfr4WA",
  authDomain: "koveliportal.firebaseapp.com",
  projectId: "koveliportal",
  storageBucket: "koveliportal.firebasestorage.app",
  messagingSenderId: "944012663073",
  appId: "1:944012663073:web:0c563572a304b1f2f48660"
};

// Firebase console > Project settings > Cloud Messaging > Web Push certificates > Key pair.
// Needed for alerts in the browser / installed web app. Leave as is to switch browser alerts off.
const KOVELI_VAPID_KEY = "BC8DU1d1N-KfnGKxjeo40mf4a1I8-vf6hiEoJ-JwNBbZ832yMi_hW6a526ZreDxgJZFXWRv2AsYKLFsQLGUWGuE";

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
