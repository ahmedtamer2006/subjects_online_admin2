/* ===================================================
   SUBJECTS ONLINE — Admin Panel Firebase Configuration
   Project: subjects-online-2nd (2nd Year)
   =================================================== */

const firebaseConfig = {
    apiKey:            "AIzaSyAEwowOnTVl5GMwvV3RkBtqyBjQ22wWd9Q",
    authDomain:        "subjects-online-2nd.firebaseapp.com",
    databaseURL:       "https://subjects-online-2nd-default-rtdb.firebaseio.com",
    projectId:         "subjects-online-2nd",
    storageBucket:     "subjects-online-2nd.firebasestorage.app",
    messagingSenderId: "610454818174",
    appId:             "1:610454818174:web:85138f505ca452536bb72f",
    measurementId:     "G-K1X2DPXCFC"
};

firebase.initializeApp(firebaseConfig);

function getFirebaseDB() {
    return firebase.firestore();
}

function getFirebaseAuth() {
    return firebase.auth();
}
