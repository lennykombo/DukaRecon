import { db } from "./firebase";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

// 1. Fetching accounts for the list screen
export async function fetchOpenAccounts(businessId) {
  const q = query(
    collection(db, "accounts"),
    where("businessId", "==", businessId),
    where("status", "==", "open")
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 2. Creating a new account (The part that was missing)
export async function createAccount(accountData, user) {
  try {
    const docRef = await addDoc(collection(db, "accounts"), {
      ...accountData,
      businessId: user.businessId, // Matches your DEV_USER
      createdBy: user.id,          // Matches your DEV_USER
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    return docRef.id; // Returns the ID so your screen can use it
  } catch (error) {
    console.error("Error creating account:", error);
    throw error;
  }
}