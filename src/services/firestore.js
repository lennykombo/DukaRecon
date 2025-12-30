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
}
