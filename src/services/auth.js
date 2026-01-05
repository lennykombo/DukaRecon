import { auth, db } from "./firebase";
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
export const signUpAttendant = async (email, password, name, shopId) => {
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
export const logoutUser = () => signOut(auth);