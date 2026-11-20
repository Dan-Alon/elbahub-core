import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAwRokOp_C4GFcYj5nAbAr1-slsNnfBqMA",
  authDomain: "the-entertainer-73323.firebaseapp.com",
  projectId: "the-entertainer-73323",
  storageBucket: "the-entertainer-73323.firebasestorage.app",
  messagingSenderId: "399999399342",
  appId: "1:399999399342:web:028e515e94df1387a2443f",
  measurementId: "G-B7K0C8NZXB"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };