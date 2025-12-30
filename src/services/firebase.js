import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDWHfJqn_sC4_R1BBOqzWacUPUuIL48bQI",
  authDomain: "dukaflow-fdb4c.firebaseapp.com",
  projectId: "dukaflow-fdb4c",
  storageBucket: "dukaflow-fdb4c.firebasestorage.app",
  messagingSenderId: "404405666346",
  appId: "1:404405666346:web:a320b95e548f3154b53953"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔑 IMPORTANT: initializeAuth ONLY ONCE
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);