import React, { useState, useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";

// Firebase Imports
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./src/services/firebase"; // Ensure this path is correct
import { doc, getDoc } from "firebase/firestore";

// Import your screens
import LoginScreen from "./src/screens/LoginScreen";
import AddSaleScreen from "./src/screens/AddSaleScreen";
import TodaySummaryScreen from "./src/screens/TodaySummaryScreen";
import AccountListScreen from "./src/screens/AccountListScreen";
import AccountDetailScreen from "./src/screens/AccountDetailScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- THE MAIN APP (After Login) ---
function MainTabs({ route }) {
  // We get the user data passed from the Stack Navigator
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
      {/* We pass the user object to each tab so they know the businessId */}
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

  useEffect(() => {
    // This listens for when a user logs in or out
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // When a user logs in, we fetch their profile (businessId, name, etc.) from Firestore
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          setUser({ uid: firebaseUser.uid, ...userDoc.data() });
        } else {
          // If no profile exists in Firestore, we treat them as logged out
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Show a loading spinner while checking if the user is logged in
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
          // 1. If NOT logged in, show Login
          <Stack.Screen 
            name="Login" 
            component={LoginScreen} 
            options={{ headerShown: false }} 
          />
        ) : (
          // 2. If LOGGED IN, show the App
          <>
            <Stack.Screen 
              name="Main" 
              component={MainTabs} 
              options={{ headerShown: false }} 
              initialParams={{ user }} // Pass user to tabs
            />
            <Stack.Screen 
              name="AccountDetail" 
              component={AccountDetailScreen} 
              options={{ title: "Account Details" }} 
              initialParams={{ user }} // Pass user to details
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}