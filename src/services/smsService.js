import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { parseMpesaSMS, parseBankSMS, parseGenericPayment } from "../utils/mpesaParser";

export async function processIncomingSMS(messageBody, sender, user) {
  if (!user || !user.businessId) return null;

  const upperSender = sender.toUpperCase();
  const data = parseMpesaSMS(messageBody) || 
               parseBankSMS(messageBody, upperSender) || 
               parseGenericPayment(messageBody);

  if (!data) return null;

  const code = data.transactionCode.toUpperCase();
  const logRef = doc(db, "mpesa_logs", code);

    // --- GET ATTENDANT DETAILS ---
  // We use the 'user' object passed from the Background Service
  const attendantInfo = {
      userId: user.uid,
      attendantName: user.name || "Unknown Attendant", // <--- THIS IS THE KEY
      email: user.email || ""
  };


  try {
    // --- SMART WRITE STRATEGY ---
    
    // 1. Try to UPDATE first.
    // If the doc exists (even if "matched"), this will just update the message/sender details
    // but it will NOT touch the 'status' field.
    // This prevents the background service from reverting a "matched" sale back to "unmatched".
    await updateDoc(logRef, {
        ...data,
        message: messageBody,
        syncedBy: attendantInfo.attendantName, 
        // We do NOT include 'status' here.
        updatedAt: serverTimestamp()
    });
    
    console.log(`✅ Log Exists: Updated details for ${code} (Status preserved)`);
    return { code };

  } catch (updateError) {
    // 2. If Update Fails, it means the document DOES NOT EXIST.
    // So we Create it with default status 'unmatched'.
    
    try {
        await setDoc(logRef, {
            ...data,
            transactionCode: code,
            businessId: user.businessId,
            userId: user.uid,
            message: messageBody,
            status: "unmatched", // Set default ONLY on create
             // --- SAVE ATTENDANT INFO HERE ---
            userId: attendantInfo.userId,           // The ID (for internal logic)
            attendantName: attendantInfo.attendantName, // The Name (for Dashboard display)
            receivedAt: serverTimestamp(),
            createdAt: serverTimestamp() 
        });
        console.log(`🆕 New Log Created: ${code}`);
        return { code };
        
    } catch (createError) {
        console.error("🔥 Create Failed:", createError);
        return null;
    }
  }
}











/*import { 
  collection, doc, setDoc, getDoc, updateDoc, serverTimestamp, query, where, getDocs 
} from "firebase/firestore";
import { db } from "./firebase";
import { 
  parseMpesaSMS, parseBankSMS, parseMpesaExpense, parseGenericPayment 
} from "../utils/mpesaParser";

export async function processIncomingSMS(messageBody, sender, user) {
  if (!user || !user.businessId) return;

  // 1. Parse Data
  const upperSender = sender.toUpperCase();
  const data = parseMpesaSMS(messageBody) || 
               parseBankSMS(messageBody, upperSender) || 
               parseMpesaExpense(messageBody) || 
               parseGenericPayment(messageBody);

  if (!data) return;

  const code = data.transactionCode.toUpperCase();
  const logRef = doc(db, "mpesa_logs", code);

  try {
    // --- STEP 1: Try to Check for Duplicates (Works in Foreground) ---
    // We wrap this in a TRY block because it fails in Background (No Auth)
    try {
      const logSnap = await getDoc(logRef);
      if (logSnap.exists()) {
        console.log(`🛡️ Duplicate skipped (Foreground): ${code}`);
        return;
      }
    } catch (readError) {
      // If we get here, it means we are likely in the Background (Auth Lost).
      // We ignore the error and proceed to Step 2 to try a "Blind Write".
      console.log("⚠️ Background Mode detected (Read Failed). Attempting Blind Write...");
    }

    // --- STEP 2: Save the Log ---
    // If the doc doesn't exist, this Creates it (Allowed by Rules).
    // If the doc DOES exist, this counts as an Update.
    // Our Rules BLOCK unauthenticated Updates. So if it's a duplicate in background, this fails silently.
    await setDoc(logRef, {
      ...data,
      transactionCode: code,
      businessId: user.businessId,
      userId: user.uid,
      message: messageBody, 
      status: "unmatched", 
      receivedAt: serverTimestamp(),
      createdAt: serverTimestamp() 
    });

    console.log(`🚀 Uploaded Log: ${code}`);

    // --- STEP 3: Auto-Match (Only works if we have Read Permission) ---
    // We wrap this too, just in case.
    try {
        const q = query(
          collection(db, "payments"), 
          where("transactionCode", "==", code),
          where("businessId", "==", user.businessId)
        );
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            await updateDoc(logRef, { status: "matched" });
            const paymentDoc = snap.docs[0];
            await updateDoc(doc(db, "payments", paymentDoc.id), {
                isVerified: true,
                verifiedAt: new Date().toISOString()
            });
            console.log("🤝 Auto-matched existing Sale");
        }
    } catch (matchError) {
        // Ignore auto-match errors in background
    }

  } catch (writeError) {
    // If setDoc fails, it's usually because the doc already exists 
    // and our Rules blocked an unauthenticated Overwrite. This is GOOD!
    if (writeError.message.includes("permission")) {
        console.log(`🛡️ Duplicate skipped (Background Protection): ${code}`);
    } else {
        console.error("🔥 SMS Sync Error:", writeError);
    }
  }
}*/















/*import { 
  collection, 
  doc, 
  setDoc,  // <-- CHANGED: We use setDoc instead of addDoc
  getDoc,  // <-- To check if it exists
  updateDoc, 
  serverTimestamp,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { db } from "./firebase";
import { 
  parseMpesaSMS, 
  parseBankSMS, 
  parseMpesaExpense, 
  parseGenericPayment 
} from "../utils/mpesaParser";

export async function processIncomingSMS(messageBody, sender, user) {
  
  if (!user || !user.businessId || !user.uid) {
    console.error("❌ SMS Error: Missing User Data.");
    return;
  }

  // --- 1. PARSE DATA ---
  let data = null;
  const upperSender = sender.toUpperCase();

  data = parseMpesaSMS(messageBody) || 
         parseBankSMS(messageBody, upperSender) || 
         parseMpesaExpense(messageBody) || 
         parseGenericPayment(messageBody);

  if (!data) return;

  try {
    const code = data.transactionCode.toUpperCase(); // Ensure uppercase
    
    // --- 2. DUPLICATE PROTECTION (THE FIX) ---
    // Instead of letting Firebase make a random ID, WE set the ID to be the Code.
    const logRef = doc(db, "mpesa_logs", code); 
    const logSnap = await getDoc(logRef);

    // If this log already exists, STOP. Do not save it again.
    if (logSnap.exists()) {
        console.log(`🛡️ Duplicate blocked by Database: ${code} already exists.`);
        return;
    }

    // --- 3. SAVE NEW LOG ---
    // We use setDoc to create the document with the specific ID (the Code)
    await setDoc(logRef, {
      ...data,
      transactionCode: code, // Ensure the code is inside the data too
      businessId: user.businessId,
      userId: user.uid,
      message: messageBody, 
      status: "unmatched", 
      receivedAt: serverTimestamp(),
      createdAt: serverTimestamp() 
    });

    console.log(`🚀 Uploaded Log: ${code}`);

    // --- 4. AUTO-MATCH SALE (Check if this payment was already manually recorded) ---
    const q = query(
      collection(db, "payments"), 
      where("transactionCode", "==", code),
      where("businessId", "==", user.businessId)
    );
    
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        // If we found a sale that matches this code, mark the log as 'matched' immediately
        // and mark the payment as verified.
        
        await updateDoc(logRef, { status: "matched" }); // Update the log we just made

        const paymentDoc = snap.docs[0];
        await updateDoc(doc(db, "payments", paymentDoc.id), {
            isVerified: true,
            verifiedAt: new Date().toISOString()
        });
        
        console.log("🤝 Auto-matched existing Sale");
    }

  } catch (error) {
    console.error("🔥 SMS Sync Error:", error);
  }
}*/











/*import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { 
  parseMpesaSMS, 
  parseBankSMS, 
  parseMpesaExpense, 
  parseGenericPayment 
} from "../utils/mpesaParser";

export async function processIncomingSMS(messageBody, sender, user) {
  
  // 1. VALIDATION: Ensure we have user data before trying to save
  if (!user || !user.businessId || !user.uid) {
    console.error("❌ SMS Error: Missing User Data (BusinessID or UID). Cannot upload log.");
    return;
  }

  console.log(`📩 Analyzing SMS from ${sender}...`);

  let data = null;
  const upperSender = sender.toUpperCase();

  // --- 2. ROBUST PARSING STRATEGY (Chain of Responsibility) ---
  
  // A. Try Standard M-Pesa (Best for Person-to-Person)
  if (!data) data = parseMpesaSMS(messageBody);

  // B. Try Bank / Sacco (Best for "Ref:" or "Reference no" formats)
  // We run this even if sender is MPESA, because Saccos often use MPESA sender ID
  if (!data) data = parseBankSMS(messageBody, upperSender);

  // C. Try Expense (Money Out)
  if (!data) data = parseMpesaExpense(messageBody);

  // D. Try Generic Fallback (Last Resort for Paybills/Weird formats)
  if (!data) {
    // Only use fallback if it really looks like a payment confirmation
    data = parseGenericPayment(messageBody);
    if (data) console.log("⚠️ Used Generic Fallback Parser");
  }

  // If still null, it's just a normal text message. Stop.
  if (!data) return;

  try {
    // --- 3. DUPLICATE CHECK ---
    const dupQuery = query(
        collection(db, "mpesa_logs"),
        where("transactionCode", "==", data.transactionCode),
        where("businessId", "==", user.businessId)
    );
    const dupSnap = await getDocs(dupQuery);
    
    if (!dupSnap.empty) {
        console.log(`🔁 Duplicate SMS (${data.transactionCode}). Skipping.`);
        return;
    }

    // --- 4. UPLOAD TO DASHBOARD (Theft Detection) ---
    await addDoc(collection(db, "mpesa_logs"), {
      ...data,
      businessId: user.businessId,
      userId: user.uid, // Required for "My Daily Report"
      message: messageBody, 
      status: "unmatched", 
      receivedAt: serverTimestamp(),
      createdAt: serverTimestamp() 
    });

    console.log(`🚀 Uploaded Log: ${data.transactionCode} | Amt: ${data.amount}`);

    // --- 5. AUTO-MATCH SALE ---
    const q = query(
      collection(db, "payments"), 
      where("transactionCode", "==", data.transactionCode),
      where("businessId", "==", user.businessId)
    );
    
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        const paymentDoc = snap.docs[0];
        
        await updateDoc(doc(db, "payments", paymentDoc.id), {
            isVerified: true,
            verifiedAt: new Date().toISOString()
        });
        
        console.log("🤝 Auto-matched existing Sale");
    }

  } catch (error) {
    console.error("🔥 SMS Sync Error:", error);
  }
}*/













/*import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
// IMPORT BOTH PARSERS
import { parseMpesaSMS, parseBankSMS } from "../utils/mpesaParser";

export async function processIncomingSMS(messageBody, sender, user) {
  
  // 1. DETERMINE TYPE & PARSE
  let data = null;
  const upperSender = sender.toUpperCase();

  // A. Check for Standard M-Pesa
  if (upperSender.includes("MPESA") || upperSender.includes("150")) {
    data = parseMpesaSMS(messageBody);
  } 
  // B. Check for Bank / Paybill (Everything else)
  else {
    // We pass the sender name so we can save "EQUITY" or "KCB" as the source
    data = parseBankSMS(messageBody, upperSender);
  }

  // If parser returned null (meaning it's just a normal text message), stop here.
  if (!data) return;

  try {
    // 2. DUPLICATE CHECK
    const dupQuery = query(
        collection(db, "mpesa_logs"),
        where("transactionCode", "==", data.transactionCode),
        where("businessId", "==", user.businessId)
    );
    const dupSnap = await getDocs(dupQuery);
    
    if (!dupSnap.empty) {
        console.log("Duplicate SMS detected. Skipping upload.");
        return;
    }

    // 3. UPLOAD TO DASHBOARD (Theft Detection)
    await addDoc(collection(db, "mpesa_logs"), {
      ...data, // includes amount, code, sender, type
      businessId: user.businessId,
      userId: user.uid, // <--- 🚨 THIS WAS MISSING! ADD THIS LINE.
      message: messageBody, 
      status: "unmatched", 
      receivedAt: serverTimestamp(),
      createdAt: serverTimestamp() 
    });

    console.log(`✅ Uploaded ${data.source} Log: ${data.transactionCode}`);

    // 4. AUTO-MATCHING LOGIC
    const q = query(
      collection(db, "payments"), 
      where("transactionCode", "==", data.transactionCode),
      where("businessId", "==", user.businessId)
    );
    
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        const paymentDoc = snap.docs[0];
        
        await updateDoc(doc(db, "payments", paymentDoc.id), {
            isVerified: true,
            verifiedAt: new Date().toISOString()
        });
        
        console.log("✅ Auto-matched Sale:", data.transactionCode);
    }

  } catch (error) {
    console.error("SMS Sync Error:", error);
  }
}*/


















/*import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
// IMPORT BOTH PARSERS
import { parseMpesaSMS, parseBankSMS } from "../utils/mpesaParser";

export async function processIncomingSMS(messageBody, sender, user) {
  
  // 1. DETERMINE TYPE & PARSE
  let data = null;
  const upperSender = sender.toUpperCase();

  // A. Check for Standard M-Pesa
  if (upperSender.includes("MPESA") || upperSender.includes("150")) {
    data = parseMpesaSMS(messageBody);
  } 
  // B. Check for Bank / Paybill (Everything else)
  else {
    // We pass the sender name so we can save "EQUITY" or "KCB" as the source
    data = parseBankSMS(messageBody, upperSender);
  }

  // If parser returned null (meaning it's just a normal text message), stop here.
  if (!data) return;

  try {
    // 2. DUPLICATE CHECK (Crucial for Dashboard Accuracy)
    // We don't want to save the same SMS twice if the listener triggers multiple times
    const dupQuery = query(
        collection(db, "mpesa_logs"),
        where("transactionCode", "==", data.transactionCode),
        where("businessId", "==", user.businessId)
    );
    const dupSnap = await getDocs(dupQuery);
    
    if (!dupSnap.empty) {
        console.log("Duplicate SMS detected. Skipping upload.");
        return;
    }

    // 3. UPLOAD TO DASHBOARD (Theft Detection)
    // This happens AUTOMATICALLY, even if the attendant doesn't save the sale.
    await addDoc(collection(db, "mpesa_logs"), {
      ...data, // includes amount, code, sender, type (bank/mpesa)
      businessId: user.businessId,
      message: messageBody, // Save raw text for debugging
      status: "unmatched", 
      receivedAt: serverTimestamp(),
      createdAt: serverTimestamp() // backup date field
    });

    console.log(`✅ Uploaded ${data.source} Log: ${data.transactionCode}`);

    // 4. AUTO-MATCHING LOGIC (Link to Sale if it exists)
    const q = query(
      collection(db, "payments"), 
      where("transactionCode", "==", data.transactionCode),
      where("businessId", "==", user.businessId)
    );
    
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        // Match found! The attendant already entered this sale.
        const paymentDoc = snap.docs[0];
        
        await updateDoc(doc(db, "payments", paymentDoc.id), {
            isVerified: true,
            verifiedAt: new Date().toISOString()
        });
        
        console.log("✅ Auto-matched Sale:", data.transactionCode);
    }

  } catch (error) {
    console.error("SMS Sync Error:", error);
  }
}*/











/*import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
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
}*/



