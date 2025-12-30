import { collection, addDoc, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
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
}