import React, { useState, useEffect } from "react";
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

  // Inside App.js useEffect
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
            {/* ADD THE SIGNUP SCREEN HERE */}
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
}