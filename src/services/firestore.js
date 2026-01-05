import { db } from "./firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

// ---------- PAYMENTS ----------
export async function createPayment(payment, user) {
  return addDoc(collection(db, "payments"), {
    ...payment,
    businessId: user.businessId,
    attendantName: user.fullName || user.name || "Staff",
    createdBy: user.uid || user.id, // Support both real Auth UID and DEV_USER id
    createdAt: serverTimestamp(),
  });
}

// CRITICAL FIX: Added businessId parameter
export async function fetchPaymentsForAccount(accountId, businessId) {
  const q = query(
    collection(db, "payments"),
    where("accountId", "==", accountId),
    where("businessId", "==", businessId) // MANDATORY: Rules will block if this is missing
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}















/*import { db } from "./firebase";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

// ---------- PAYMENTS ----------
export async function createPayment(payment, user) {
  return addDoc(collection(db, "payments"), {
    ...payment,
    businessId: user.businessId,
    createdBy: user.id,
    createdAt: serverTimestamp(),
  });
}

export async function fetchPaymentsForAccount(accountId) {
  const q = query(
    collection(db, "payments"),
    where("accountId", "==", accountId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}*/
