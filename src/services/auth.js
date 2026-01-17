import { auth, db } from "./firebase";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword,
  deleteUser // <--- IMPORT THIS
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  collection, 
  where, 
  getDocs 
} from "firebase/firestore";

// --- LOGIN FUNCTION ---
export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch profile
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (userDoc.exists()) {
      return { uid: user.uid, ...userDoc.data() };
    } else {
      // If Auth exists but Profile doesn't, we should logout or throw
      throw new Error("User profile not found. Please contact support.");
    }
  } catch (error) {
    throw error;
  }
};

// --- ATTENDANT SIGNUP FUNCTION (FIXED) ---
export const signUpAttendant = async (email, password, name, shopId) => {
  let userCredential; // Keep reference to cleanup later

  try {
    // STEP 1: Create Auth User
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // STEP 2: Search for the Shop Owner
    // NOTE: This step requires Firestore Rules to allow reading "users" collection
    const bizQuery = query(
      collection(db, "users"), 
      where("businessId", "==", shopId),
      where("role", "==", "owner")
    );
    
    const bizSnap = await getDocs(bizQuery);

    // STEP 3: Validate Shop ID
    if (bizSnap.empty) {
      throw new Error("Invalid Shop ID. ID not found or incorrect.");
    }

    const ownerData = bizSnap.docs[0].data();
    const businessName = ownerData.businessName || "Unknown Shop";

    // STEP 4: Create the Profile
    const userData = {
      uid: uid,
      name: name,
      email: email,
      role: "attendant",
      businessId: shopId,
      businessName: businessName,
      createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, "users", uid), userData);
    return userData;

  } catch (error) {
    console.error("Signup Error Details:", error);

    // --- CRITICAL CLEANUP ---
    // If we created the Auth User (Step 1) but failed at Step 2 or 3...
    // We MUST delete the Auth User, otherwise the email is locked forever.
    if (userCredential && userCredential.user) {
      console.log("Cleaning up: Deleting zombie auth user...");
      try {
        await deleteUser(userCredential.user);
      } catch (cleanupErr) {
        console.error("Failed to delete user during cleanup:", cleanupErr);
      }
    }

    throw error;
  }
};

export const logoutUser = () => signOut(auth);










/*import { auth, db } from "./firebase";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword 
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  collection, 
  where, 
  getDocs 
} from "firebase/firestore";

// --- LOGIN FUNCTION ---
export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (userDoc.exists()) {
      return { uid: user.uid, ...userDoc.data() };
    } else {
      throw new Error("User profile not found in database.");
    }
  } catch (error) {
    throw error;
  }
};

// --- ATTENDANT SIGNUP FUNCTION ---
/*export const signUpAttendant = async (email, password, name, shopId) => {
  try {
    // 1. Verify if the Shop ID (Business ID) exists
    // We look for any user (Owner) who has this businessId
    const bizQuery = query(
      collection(db, "users"), 
      where("businessId", "==", shopId)
    );
    const bizSnap = await getDocs(bizQuery);

    if (bizSnap.empty) {
      throw new Error("Invalid Shop ID. Please ask your manager for the correct code.");
    }

    // Get the business name from the owner's record to store it for the attendant
    const businessName = bizSnap.docs[0].data().businessName;

    // 2. Create the user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // 3. Create the Attendant Profile in Firestore
    const userData = {
      uid: uid,
      name: name,
      email: email,
      role: "attendant",
      businessId: shopId,
      businessName: businessName,
      createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, "users", uid), userData);
    
    return userData;
  } catch (error) {
    // Forward the specific Firebase or Validation error
    throw error;
  }
};*/

// --- ATTENDANT SIGNUP FUNCTION ---
/*export const signUpAttendant = async (email, password, name, shopId) => {
  try {
    // STEP 1: Create the Auth User FIRST.
    // This makes the person "Authenticated" so they can pass the first part of the rules.
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // STEP 2: Now that we are logged in, search for the Shop Owner.
    const bizQuery = query(
      collection(db, "users"), 
      where("businessId", "==", shopId),
      where("role", "==", "owner")
    );
    
    const bizSnap = await getDocs(bizQuery);

    // STEP 3: If the shop doesn't exist, we must stop.
    if (bizSnap.empty) {
      // Optional: Delete the auth user if the shop ID was wrong to allow them to try again
      // await userCredential.user.delete(); 
      throw new Error("Shop ID not found. Please check the code with your manager.");
    }

    const ownerData = bizSnap.docs[0].data();
    const businessName = ownerData.businessName;

    // STEP 4: Create the Firestore Profile
    const userData = {
      uid: uid,
      name: name,
      email: email,
      role: "attendant",
      businessId: shopId,
      businessName: businessName,
      createdAt: new Date().toISOString(),
    };

    await setDoc(doc(db, "users", uid), userData);
    return userData;

  } catch (error) {
    console.error("Signup Error Details:", error);
    throw error;
  }
};

// --- LOGOUT FUNCTION ---
export const logoutUser = () => signOut(auth);*/