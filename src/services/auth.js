import { auth, db } from "./firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// Login function
export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Fetch the user's business profile from Firestore
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

// Logout function
export const logoutUser = () => signOut(auth);