// The Firebase project for the online features (docs/online.md). None of this
// is secret: it identifies the project to Firebase, and the database rules
// decide what anyone may do.
export const firebaseConfig = {
  apiKey: 'AIzaSyBhuNtiDR_BTzUm0n5pwm1k8ZI9DqCY2WQ',
  authDomain: 'zygoloid-github-io.firebaseapp.com',
  projectId: 'zygoloid-github-io',
  storageBucket: 'zygoloid-github-io.firebasestorage.app',
  messagingSenderId: '364143983756',
  appId: '1:364143983756:web:8aaf23298300d2681d0fa9',
};

// This game's own database instance (not the project's default one).
export const DATABASE_URL = 'https://zygoloid-stacked-deck.firebaseio.com';

// The Firebase JS SDK's browser modules, at an exact version.
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/13.1.0';

// The project the Firebase emulators run as in tests (`?emulator`; see
// src/ui/cloud.js).
export const EMULATOR_PROJECT = 'demo-stacked-deck';

// App Check's reCAPTCHA Enterprise site key. While it is empty, App Check is
// not used (and must not be enforced in the console).
export const APP_CHECK_SITE_KEY = '';
