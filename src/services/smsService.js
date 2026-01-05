import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { parseMpesaSMS } from "../utils/mpesaParser";

// ✅ UPDATED: Added 'user' parameter
export async function processIncomingSMS(messageBody, sender, user) {
  // 1. Filter for M-Pesa only
  if (!sender.toLowerCase().includes("mpesa")) return;

  const data = parseMpesaSMS(messageBody);
  if (!data) return;

  try {
    // 2. Save the "Official Record" for the Owner Dashboard
    // Stamped with the real businessId from the logged-in user
    await addDoc(collection(db, "mpesa_logs"), {
      ...data,
      businessId: user.businessId,
      status: "unmatched", 
      receivedAt: serverTimestamp()
    });

    // 3. AUTO-MATCHING LOGIC:
    // We search for a sale that matches this code AND belongs to this business
    const q = query(
      collection(db, "payments"), 
      where("transactionCode", "==", data.transactionCode),
      where("businessId", "==", user.businessId) // 🔒 MANDATORY: Security rules require this
    );
    
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        // We found a match! Mark it as verified
        const paymentDoc = snap.docs[0];
        
        await updateDoc(doc(db, "payments", paymentDoc.id), {
            isVerified: true,
            verifiedAt: new Date().toISOString()
        });
        
        console.log("✅ Auto-matched M-Pesa Code:", data.transactionCode);
        
        // Optional: Update the log status to matched as well
        // (Helps the owner see which logs are "Ghost" money)
    }

  } catch (error) {
    // If this fails with "Permission Denied", double check that 
    // user.businessId exists and matches your Firestore profile
    console.error("SMS Sync Error:", error);
  }
}

















/*import { collection, addDoc, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "./firebase";
import { parseMpesaSMS } from "../utils/mpesaParser";
import { DEV_USER } from "../utils/devUser";

export async function processIncomingSMS(messageBody, sender) {
  if (!sender.toLowerCase().includes("mpesa")) return;

  const data = parseMpesaSMS(messageBody);
  if (!data) return;

  try {
    // 1. Save the "Official Record" for the Owner Dashboard
    await addDoc(collection(db, "mpesa_logs"), {
      ...data,
      businessId: DEV_USER.businessId,
      status: "unmatched", // Will change to "matched" once linked to a sale
    });

    // 2. AUTO-MATCHING LOGIC:
    // Look for a sale the attendant just entered with this same code
    const q = query(
      collection(db, "payments"), 
      where("transactionCode", "==", data.transactionCode)
    );
    
    const snap = await getDocs(q);
    if (!snap.empty) {
        // We found a match! Mark it as verified
        const paymentDoc = snap.docs[0];
        await updateDoc(doc(db, "payments", paymentDoc.id), {
            isVerified: true,
            verifiedAt: new Date().toISOString()
        });
        console.log("✅ Auto-matched M-Pesa Code:", data.transactionCode);
    }

  } catch (error) {
    console.error("SMS Sync Error:", error);
  }
}*/