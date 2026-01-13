import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage'; 

// Firebase Imports
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./src/services/firebase"; 
import { doc, getDoc } from "firebase/firestore";

// Background Service
import { startBackgroundListener } from "./src/services/backgroundService";

// Import your screens
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import AddSaleScreen from "./src/screens/AddSaleScreen";
import TodaySummaryScreen from "./src/screens/TodaySummaryScreen";
import AccountListScreen from "./src/screens/AccountListScreen";
import AccountDetailScreen from "./src/screens/AccountDetailScreen";
import AddExpenseScreen from "./src/screens/AddExpenseScreen"; 


const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- THE MAIN APP (After Login) ---
function MainTabs({ route }) {
  const { user } = route.params;

  return (
    <Tab.Navigator 
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === "Summary") iconName = "stats-chart";
          else if (route.name === "New Sale") iconName = "add-circle";
          else if (route.name === "Expenses") iconName = "remove-circle";
          else if (route.name === "Debt List") iconName = "people";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#1565c0",
        tabBarInactiveTintColor: "gray",
      })}
    >
      <Tab.Screen name="Summary" component={TodaySummaryScreen} initialParams={{ user }} />
      <Tab.Screen name="New Sale" component={AddSaleScreen} initialParams={{ user }} />
      <Tab.Screen 
        name="Expenses" 
        component={AddExpenseScreen} 
        initialParams={{ user }} 
        options={{ title: "Expenses" }}
      />
      <Tab.Screen name="Debt List" component={AccountListScreen} initialParams={{ user }} />
    </Tab.Navigator>
  );
}

// --- ROOT NAVIGATOR ---
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        console.log("Auth Detected User:", firebaseUser.uid);
        
        try {
          // A. Try to fetch fresh data from Firestore (Online)
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          
          if (userDoc.exists()) {
            const userData = { uid: firebaseUser.uid, ...userDoc.data() };
            
            // ✅ 2. SAVE TO CACHE (For next time or offline use)
            await AsyncStorage.setItem("userProfile", JSON.stringify(userData));
            
            setUser(userData);

            if (userData.businessId) {
                startBackgroundListener(userData);
            }
          } else {
            console.warn("Auth exists, but profile missing.");
            setUser(null);
          }
        } catch (err) {
          console.error("Firestore Network Error:", err);
          
          // ✅ 3. OFFLINE FALLBACK: Load from Cache
          try {
            const cachedProfile = await AsyncStorage.getItem("userProfile");
            if (cachedProfile) {
              console.log("Loading user from Local Cache (Offline Mode)");
              const userData = JSON.parse(cachedProfile);
              
              setUser(userData);
              
              // Still try to start listener even if offline
              if (userData.businessId) {
                  startBackgroundListener(userData);
              }
            } else {
              // No internet AND no cache? Must log out.
              setUser(null);
            }
          } catch (cacheErr) {
            setUser(null);
          }
        }
      } else {
        // User logged out explicitly
        console.log("No user logged in.");
        setUser(null);
        // Clear cache so next person doesn't see old data
        AsyncStorage.removeItem("userProfile");
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1565c0" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user === null ? (
          // --- LOGGED OUT STATE ---
          <>
            <Stack.Screen 
              name="Login" 
              component={LoginScreen} 
              options={{ headerShown: false }} 
            />
            <Stack.Screen 
              name="Signup" 
              component={SignupScreen} 
              options={{ 
                title: "Create Attendant Account",
                headerStyle: { backgroundColor: '#f6f7f9' },
                headerTintColor: '#333'
              }} 
            />
          </>
        ) : (
          // --- LOGGED IN STATE ---
          <>
            <Stack.Screen 
              name="Main" 
              component={MainTabs} 
              options={{ headerShown: false }} 
              initialParams={{ user }} 
            />
            <Stack.Screen 
              name="AccountDetail" 
              component={AccountDetailScreen} 
              options={{ title: "Account Details" }} 
              initialParams={{ user }} 
            />
            <Stack.Screen 
              name="AddExpense" 
              component={AddExpenseScreen} 
              options={{ title: "Record Expense" }} 
              initialParams={{ user }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}













/*import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";

// Firebase Imports
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./src/services/firebase"; 
import { doc, getDoc } from "firebase/firestore";

// --- NEW IMPORT: Background Service ---
import { startBackgroundListener } from "./src/services/backgroundService";

// Import your screens
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import AddSaleScreen from "./src/screens/AddSaleScreen";
import TodaySummaryScreen from "./src/screens/TodaySummaryScreen";
import AccountListScreen from "./src/screens/AccountListScreen";
import AccountDetailScreen from "./src/screens/AccountDetailScreen";
import AddExpenseScreen from "./src/screens/AddExpenseScreen"; // Ensure this is imported if you added expenses earlier

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- THE MAIN APP (After Login) ---
function MainTabs({ route }) {
  const { user } = route.params;

  return (
    <Tab.Navigator 
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === "Summary") iconName = "stats-chart";
          else if (route.name === "New Sale") iconName = "add-circle";
          else if (route.name === "Debt List") iconName = "people";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#1565c0",
        tabBarInactiveTintColor: "gray",
      })}
    >
      <Tab.Screen name="Summary" component={TodaySummaryScreen} initialParams={{ user }} />
      <Tab.Screen name="New Sale" component={AddSaleScreen} initialParams={{ user }} />
      <Tab.Screen name="Debt List" component={AccountListScreen} initialParams={{ user }} />
    </Tab.Navigator>
  );
}

// --- ROOT NAVIGATOR ---
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Inside App.js useEffect
  /*useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        console.log("Auth Detected User:", firebaseUser.uid);
        
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          
          if (userDoc.exists()) {
            const userData = { uid: firebaseUser.uid, ...userDoc.data() };
            console.log("Firestore Profile Found:", userData);
            
            setUser(userData);

            // --- START BACKGROUND LISTENER HERE ---
            // This ensures we only start listening once we know the Business ID
            if (userData.businessId) {
                console.log("Initializing Background Service...");
                startBackgroundListener(userData);
            }

          } else {
            console.warn("Auth exists, but NO document found in 'users' collection with ID:", firebaseUser.uid);
            setUser(null); 
          }
        } catch (err) {
          console.error("Firestore Fetch Error:", err);
          setUser(null);
        }
      } else {
        console.log("No user logged in.");
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);*/
/*
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is logged in, but we need to fetch profile.
        // We do NOT set loading(false) yet.
        console.log("Auth User detected, fetching profile...");
        
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          
          if (userDoc.exists()) {
            const userData = { uid: firebaseUser.uid, ...userDoc.data() };
            setUser(userData);
            
            // Start background service
            if (userData.businessId) {
                startBackgroundListener(userData);
            }
          } else {
            setUser(null);
          }
        } catch (err) {
          console.error("Firestore Error:", err);
          setUser(null);
        }
      } else {
        // User is logged out
        setUser(null);
      }
      
      // ONLY set global loading to false AFTER we have the profile data
      setLoading(false); 
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1565c0" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user === null ? (
          // --- LOGGED OUT STATE ---
          <>
            <Stack.Screen 
              name="Login" 
              component={LoginScreen} 
              options={{ headerShown: false }} 
            />
            <Stack.Screen 
              name="Signup" 
              component={SignupScreen} 
              options={{ 
                title: "Create Attendant Account",
                headerStyle: { backgroundColor: '#f6f7f9' },
                headerTintColor: '#333'
              }} 
            />
          </>
        ) : (
          // --- LOGGED IN STATE ---
          <>
            <Stack.Screen 
              name="Main" 
              component={MainTabs} 
              options={{ headerShown: false }} 
              initialParams={{ user }} 
            />
            <Stack.Screen 
              name="AccountDetail" 
              component={AccountDetailScreen} 
              options={{ title: "Account Details" }} 
              initialParams={{ user }} 
            />
            {/* Added AddExpense Route just in case you implemented it *//*
            <Stack.Screen 
              name="AddExpense" 
              component={AddExpenseScreen} 
              options={{ title: "Record Expense" }} 
              initialParams={{ user }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}*/




















/*import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";

// Firebase Imports
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./src/services/firebase"; 
import { doc, getDoc } from "firebase/firestore";

// Import your screens
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen"; // <--- ADD THIS
import AddSaleScreen from "./src/screens/AddSaleScreen";
import TodaySummaryScreen from "./src/screens/TodaySummaryScreen";
import AccountListScreen from "./src/screens/AccountListScreen";
import AccountDetailScreen from "./src/screens/AccountDetailScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- THE MAIN APP (After Login) ---
function MainTabs({ route }) {
  const { user } = route.params;

  return (
    <Tab.Navigator 
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === "Summary") iconName = "stats-chart";
          else if (route.name === "New Sale") iconName = "add-circle";
          else if (route.name === "Debt List") iconName = "people";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#1565c0",
        tabBarInactiveTintColor: "gray",
      })}
    >
      <Tab.Screen name="Summary" component={TodaySummaryScreen} initialParams={{ user }} />
      <Tab.Screen name="New Sale" component={AddSaleScreen} initialParams={{ user }} />
      <Tab.Screen name="Debt List" component={AccountListScreen} initialParams={{ user }} />
    </Tab.Navigator>
  );
}

// --- ROOT NAVIGATOR ---
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  /*useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          setUser({ uid: firebaseUser.uid, ...userDoc.data() });
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);*/

/*
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      console.log("Auth Detected User:", firebaseUser.uid);
      
      try {
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        
        if (userDoc.exists()) {
          console.log("Firestore Profile Found:", userDoc.data());
          setUser({ uid: firebaseUser.uid, ...userDoc.data() });
        } else {
          console.warn("Auth exists, but NO document found in 'users' collection with ID:", firebaseUser.uid);
          // If you see this log, it means your Signup code created the doc with the wrong ID
          setUser(null); 
        }
      } catch (err) {
        console.error("Firestore Fetch Error:", err);
        setUser(null);
      }
    } else {
      console.log("No user logged in.");
      setUser(null);
    }
    setLoading(false);
  });

  return unsubscribe;
}, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1565c0" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user === null ? (
          // --- LOGGED OUT STATE ---
          <>
            <Stack.Screen 
              name="Login" 
              component={LoginScreen} 
              options={{ headerShown: false }} 
            />
            {/* ADD THE SIGNUP SCREEN HERE *//*
            <Stack.Screen 
              name="Signup" 
              component={SignupScreen} 
              options={{ 
                title: "Create Attendant Account",
                headerStyle: { backgroundColor: '#f6f7f9' },
                headerTintColor: '#333'
              }} 
            />
          </>
        ) : (
          // --- LOGGED IN STATE ---
          <>
            <Stack.Screen 
              name="Main" 
              component={MainTabs} 
              options={{ headerShown: false }} 
              initialParams={{ user }} 
            />
            <Stack.Screen 
              name="AccountDetail" 
              component={AccountDetailScreen} 
              options={{ title: "Account Details" }} 
              initialParams={{ user }} 
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}*/