/*import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert, Linking, Platform } from "react-native";
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../services/firebase"; // Check this path matches your file structure
import Card from "../components/Card";
import { useFocusEffect } from "@react-navigation/native";

export default function TodaySummaryScreen({ route, navigation }) {
  // SAFETY: Handle missing params gracefully
  const { user } = route.params || {}; 

  const [summary, setSummary] = useState({
    cashSales: 0,
    mpesaSales: 0, 
    bankSales: 0,  
    mpesaActual: 0, 
    bankActual: 0,  
    totalSales: 0,
    unverifiedTransactions: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  // 1. Check Battery on Mount
  useEffect(() => {
    checkBatteryOptimization();
  }, []);

  // 2. Auto-Refresh when screen comes into focus (e.g. after adding a sale)
  useFocusEffect(
    useCallback(() => {
      if(user) loadTodayData();
    }, [user])
  );

  const checkBatteryOptimization = async () => {
    try {
      const hasAsked = await AsyncStorage.getItem("hasAskedBatteryOpt");
      if (hasAsked !== 'true' && Platform.OS === 'android') {
        Alert.alert(
          "Background Setup Required",
          "To ensure the app catches every payment SMS, you must allow it to run in the background.\n\n1. Tap 'Open Settings'\n2. Find DukaRecon\n3. Select 'Battery'\n4. Choose 'Unrestricted' or 'No Restrictions'",
          [
            { text: "Later", style: "cancel" },
            { 
              text: "Open Settings", 
              onPress: async () => {
                Linking.openSettings(); 
                await AsyncStorage.setItem("hasAskedBatteryOpt", "true");
              } 
            }
          ]
        );
      }
    } catch (error) {
      console.log("Error checking battery pref:", error);
    }
  };

  async function loadTodayData() {
    if (!user || !user.businessId) {
        console.log("Skipping load: Missing user or businessId");
        return;
    }

    setRefreshing(true);
    
    // Create a Date object for 00:00:00 today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0); 
    
    // Convert to Firestore Timestamp (Best Practice)
    const startTimestamp = Timestamp.fromDate(startOfDay);

    try {
      // --- QUERY 1: PAYMENTS (Sales recorded by Attendant) ---
      // Matches Rule: allow read: if businessId == getMyBizId()
      const paymentsQ = query(
        collection(db, "payments"),
        where("businessId", "==", user.businessId), // REQUIRED BY RULES
        where("createdBy", "==", user.uid),         // Filter for this attendant
        where("createdAt", ">=", startTimestamp)    // Filter for Today
      );

      // --- QUERY 2: MPESA LOGS (SMS detected by Service) ---
      // Matches Rule: allow read: if userId == request.auth.uid
      const logsQ = query(
        collection(db, "mpesa_logs"),
        where("userId", "==", user.uid),            // REQUIRED BY RULES
        where("createdAt", ">=", startTimestamp)
      );

      const [paymentsSnap, logsSnap] = await Promise.all([
        getDocs(paymentsQ),
        getDocs(logsQ)
      ]);

      let cash = 0, mpesaRecorded = 0, bankRecorded = 0, unverified = 0;
      let mpesaActual = 0, bankActual = 0;

      // Process Payments
      paymentsSnap.forEach((doc) => {
        const d = doc.data();
        const amt = Number(d.amount || 0); 
        const method = (d.paymentMethod || "cash").toLowerCase();
        
        if (method === "cash") {
          cash += amt;
        } else if (method === "mpesa") {
          mpesaRecorded += amt;
          if (!d.isVerified) unverified++;
        } else if (method === "bank") {
          bankRecorded += amt;
          if (!d.isVerified) unverified++;
        }
      });

      // Process Logs
      logsSnap.forEach((doc) => {
        const d = doc.data();
        const amt = Number(d.amount || 0);
        // Normalize type (some logs might store it differently)
        const type = (d.type || "mpesa").toLowerCase();

        if (type.includes('bank')) {
            bankActual += amt;
        } else {
            mpesaActual += amt;
        }
      });

      setSummary({
        cashSales: cash,
        mpesaSales: mpesaRecorded,
        bankSales: bankRecorded,
        mpesaActual: mpesaActual,
        bankActual: bankActual,
        totalSales: cash + mpesaRecorded + bankRecorded,
        unverifiedTransactions: unverified,
      });

    } catch (error) {
      console.error("Report Error:", error);
      
      if (error.code === 'failed-precondition') {
          Alert.alert(
              "Database Index Required", 
              "This query requires an index. Check the console logs in Metro bundler for the link to create it."
          );
      } else if (error.code === 'permission-denied') {
          Alert.alert("Permission Error", "Ensure your user profile has the correct 'businessId' assigned.");
      }
    } finally {
      setRefreshing(false);
    }
  }

  const safeFormat = (val) => {
    return (Number(val) || 0).toLocaleString();
  };

  const mpesaVariance = (summary.mpesaActual || 0) - (summary.mpesaSales || 0);
  const bankVariance = (summary.bankActual || 0) - (summary.bankSales || 0);

  const AuditRow = ({ title, actual, recorded, variance }) => (
    <View style={styles.auditContainer}>
      <Text style={styles.auditTitle}>{title}</Text>
      <View style={styles.auditDetails}>
        <View style={styles.col}>
            <Text style={styles.label}>Actual (SMS)</Text>
            <Text style={[styles.val, {color: '#2e7d32'}]}>KES {safeFormat(actual)}</Text>
        </View>
        <View style={styles.col}>
            <Text style={styles.label}>Recorded (App)</Text>
            <Text style={[styles.val, {color: '#1565c0'}]}>KES {safeFormat(recorded)}</Text>
        </View>
        <View style={styles.col}>
            <Text style={styles.label}>Diff</Text>
            <Text style={[styles.val, { color: variance === 0 ? '#aaa' : (variance > 0 ? '#d32f2f' : '#f57c00') }]}>
               {variance > 0 ? "+" : ""}{safeFormat(variance)}
            </Text>
        </View>
      </View>
      {variance > 0 && <Text style={styles.alertText}>⚠️ Unrecorded Money Found!</Text>}
      {variance < 0 && <Text style={styles.alertText}>⚠️ Sales Recorded without SMS!</Text>}
    </View>
  );

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadTodayData} />}
    >
      <View style={styles.headerBox}>
        <Text style={styles.header}>My Shift Report</Text>
        <Text style={styles.date}>{new Date().toDateString()}</Text>
        <Text style={{color: '#666', marginTop: 4}}>
           {user?.name || "Attendant"} 
        </Text>
      </View>

      <View style={styles.mainCard}>
        <Text style={styles.totalLabel}>TOTAL SALES COLLECTED</Text>
        <Text style={styles.totalValue}>KES {safeFormat(summary.totalSales)}</Text>
        <View style={styles.pillContainer}>
            <View style={styles.pill}><Text style={styles.pillText}>Cash: {safeFormat(summary.cashSales)}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Digital: {safeFormat(summary.mpesaSales + summary.bankSales)}</Text></View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>RECONCILIATION</Text>
      
      <Card>
        <AuditRow 
            title="📱 M-Pesa Balancing"
            actual={summary.mpesaActual}
            recorded={summary.mpesaSales}
            variance={mpesaVariance}
        />
        <View style={styles.divider}/>
        <AuditRow 
            title="🏦 Bank Balancing"
            actual={summary.bankActual}
            recorded={summary.bankSales}
            variance={bankVariance}
        />
      </Card>

      <Text style={styles.sectionTitle}>CASH HANDOVER</Text>
      <Card>
        <View style={styles.rowBetween}>
            <Text style={styles.cashLabel}>Expected Cash:</Text>
            <Text style={styles.cashValue}>KES {safeFormat(summary.cashSales)}</Text>
        </View>
        <Text style={styles.hint}>Count the cash in the drawer. It should match this amount.</Text>
      </Card>

      <TouchableOpacity style={styles.btn} onPress={loadTodayData}>
        <Text style={styles.btnText}>🔄 Refresh Report</Text>
      </TouchableOpacity>
      
      <View style={{height: 30}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f6f7f9" },
  headerBox: { marginBottom: 15 },
  header: { fontSize: 24, fontWeight: "900", color: "#333" },
  date: { fontSize: 14, color: "#666" },
  
  mainCard: { backgroundColor: "#1565c0", padding: 20, borderRadius: 16, alignItems: "center", marginBottom: 20, elevation: 5 },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "bold", letterSpacing: 1 },
  totalValue: { color: "#fff", fontSize: 34, fontWeight: "900", marginVertical: 8 },
  pillContainer: { flexDirection: 'row', gap: 10 },
  pill: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#888', marginBottom: 8, marginTop: 10, paddingLeft: 4 },
  
  auditContainer: { paddingVertical: 5 },
  auditTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  auditDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { alignItems: 'center', flex: 1 },
  label: { fontSize: 11, color: '#888', marginBottom: 2 },
  val: { fontSize: 14, fontWeight: 'bold' },
  alertText: { fontSize: 11, color: '#d32f2f', textAlign: 'center', marginTop: 8, backgroundColor: '#ffebee', padding: 4, borderRadius: 4 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cashLabel: { fontSize: 16, color: '#555', fontWeight: '600' },
  cashValue: { fontSize: 20, color: '#2e7d32', fontWeight: '900' },
  hint: { fontSize: 12, color: '#999', marginTop: 5, fontStyle: 'italic' },

  btn: { backgroundColor: '#e3f2fd', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#1565c0', fontWeight: 'bold' }
});
*/










/*

import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import Card from "../components/Card";

export default function TodaySummaryScreen({ route }) {
  const { user } = route.params; 

  const [summary, setSummary] = useState({
    cashSales: 0,
    mpesaSales: 0, // Recorded in App
    bankSales: 0,  // Recorded in App
    mpesaActual: 0, // From SMS Logs
    bankActual: 0,  // From SMS Logs
    totalSales: 0,
    unverifiedTransactions: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTodayData();
  }, [user]);

  async function loadTodayData() {
    if (!user || !user.businessId) return;

    setRefreshing(true);
    
    // 1. Get Start of Today (00:00:00)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0); 

    console.log("📊 GENERATING REPORT FOR:", user.email);

    try {
      // --- QUERY 1: PAYMENTS (What John Recorded) ---
      // We filter by 'createdBy' because the payment data has: createdBy: "s9o..."
      const paymentsQ = query(
        collection(db, "payments"),
        where("businessId", "==", user.businessId),
        where("createdBy", "==", user.uid), 
        where("createdAt", ">=", startOfDay)
      );

      // --- QUERY 2: MPESA LOGS (What SMS Said) ---
      // We filter by 'userId' because the log data has: userId: "s9o..."
      const logsQ = query(
        collection(db, "mpesa_logs"),
        where("businessId", "==", user.businessId),
        where("userId", "==", user.uid), 
        where("createdAt", ">=", startOfDay) 
      );

      const [paymentsSnap, logsSnap] = await Promise.all([
        getDocs(paymentsQ),
        getDocs(logsQ)
      ]);

      console.log(`✅ Payments (App Entries): ${paymentsSnap.size}`);
      console.log(`✅ Logs (SMS Received): ${logsSnap.size}`);

      // --- CALCULATE TOTALS ---
      let cash = 0, mpesaRecorded = 0, bankRecorded = 0, unverified = 0;
      let mpesaActual = 0, bankActual = 0;

      // 1. Process App Entries
      paymentsSnap.forEach((doc) => {
        const d = doc.data();
        const amt = Number(d.amount || 0); // Handle number or string safely
        const method = (d.paymentMethod || "cash").toLowerCase();
        
        if (method === "cash") {
          cash += amt;
        } else if (method === "mpesa") {
          mpesaRecorded += amt;
          if (!d.isVerified) unverified++;
        } else if (method === "bank") {
          bankRecorded += amt;
          if (!d.isVerified) unverified++;
        }
      });

      // 2. Process SMS Logs
      logsSnap.forEach((doc) => {
        const d = doc.data();
        const amt = Number(d.amount || 0);
        const type = (d.type || "mpesa").toLowerCase();

        // SEPARATE BANK VS MPESA LOGS
        if (type === 'bank') {
            bankActual += amt;
        } else {
            // "mpesa", "paybill", "till" usually fall here
            mpesaActual += amt;
        }
      });

      setSummary({
        cashSales: cash,
        mpesaSales: mpesaRecorded,
        bankSales: bankRecorded,
        mpesaActual: mpesaActual,
        bankActual: bankActual,
        totalSales: cash + mpesaRecorded + bankRecorded,
        unverifiedTransactions: unverified,
      });

    } catch (error) {
      console.error("🔥 REPORT ERROR:", error);
      if (error.message.includes("index")) {
        Alert.alert("Missing Index", "Please check your laptop terminal/console. Firebase has sent a link to create the required index for this report.");
      } else {
        Alert.alert("Error", error.message);
      }
    } finally {
      setRefreshing(false);
    }
  }

  // Variances (Positive = Money in Phone but not in App)
  const mpesaVariance = summary.mpesaActual - summary.mpesaSales;
  const bankVariance = summary.bankActual - summary.bankSales;

  // --- REUSABLE ROW COMPONENT ---
  const AuditRow = ({ title, actual, recorded, variance }) => (
    <View style={styles.auditContainer}>
      <Text style={styles.auditTitle}>{title}</Text>
      <View style={styles.auditDetails}>
        <View style={styles.col}>
            <Text style={styles.label}>Actual (SMS)</Text>
            <Text style={[styles.val, {color: '#2e7d32'}]}>KES {actual.toLocaleString()}</Text>
        </View>
        <View style={styles.col}>
            <Text style={styles.label}>Recorded (App)</Text>
            <Text style={[styles.val, {color: '#1565c0'}]}>KES {recorded.toLocaleString()}</Text>
        </View>
        <View style={styles.col}>
            <Text style={styles.label}>Diff</Text>
            <Text style={[styles.val, { color: variance === 0 ? '#aaa' : (variance > 0 ? '#d32f2f' : '#f57c00') }]}>
               {variance > 0 ? "+" : ""}{variance.toLocaleString()}
            </Text>
        </View>
      </View>
      {variance > 0 && <Text style={styles.alertText}>⚠️ Unrecorded Money Found!</Text>}
      {variance < 0 && <Text style={styles.alertText}>⚠️ Sales Recorded without SMS!</Text>}
    </View>
  );

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadTodayData} />}
    >
      <View style={styles.headerBox}>
        <Text style={styles.header}>My Shift Report</Text>
        <Text style={styles.date}>{new Date().toDateString()}</Text>
      </View>

      {/* 1. TOTALS CARD *//*
      <View style={styles.mainCard}>
        <Text style={styles.totalLabel}>TOTAL SALES COLLECTED</Text>
        <Text style={styles.totalValue}>KES {summary.totalSales.toLocaleString()}</Text>
        <View style={styles.pillContainer}>
            <View style={styles.pill}><Text style={styles.pillText}>Cash: {summary.cashSales.toLocaleString()}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Digital: {(summary.mpesaSales + summary.bankSales).toLocaleString()}</Text></View>
        </View>
      </View>

      {/* 2. DIGITAL RECONCILIATION *//*
      <Text style={styles.sectionTitle}>RECONCILIATION</Text>
      
      <Card>
        <AuditRow 
            title="📱 M-Pesa Balancing"
            actual={summary.mpesaActual}
            recorded={summary.mpesaSales}
            variance={mpesaVariance}
        />
        <View style={styles.divider}/>
        <AuditRow 
            title="🏦 Bank Balancing"
            actual={summary.bankActual}
            recorded={summary.bankSales}
            variance={bankVariance}
        />
      </Card>

      {/* 3. CASH HANDOVER *//*
      <Text style={styles.sectionTitle}>CASH HANDOVER</Text>
      <Card>
        <View style={styles.rowBetween}>
            <Text style={styles.cashLabel}>Expected Cash:</Text>
            <Text style={styles.cashValue}>KES {summary.cashSales.toLocaleString()}</Text>
        </View>
        <Text style={styles.hint}>Count the cash in the drawer. It should match this amount.</Text>
      </Card>

      <TouchableOpacity style={styles.btn} onPress={loadTodayData}>
        <Text style={styles.btnText}>🔄 Refresh Report</Text>
      </TouchableOpacity>
      
      <View style={{height: 30}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f6f7f9" },
  headerBox: { marginBottom: 15 },
  header: { fontSize: 24, fontWeight: "900", color: "#333" },
  date: { fontSize: 14, color: "#666" },
  
  mainCard: { backgroundColor: "#1565c0", padding: 20, borderRadius: 16, alignItems: "center", marginBottom: 20, elevation: 5 },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "bold", letterSpacing: 1 },
  totalValue: { color: "#fff", fontSize: 34, fontWeight: "900", marginVertical: 8 },
  pillContainer: { flexDirection: 'row', gap: 10 },
  pill: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#888', marginBottom: 8, marginTop: 10, paddingLeft: 4 },
  
  auditContainer: { paddingVertical: 5 },
  auditTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  auditDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { alignItems: 'center', flex: 1 },
  label: { fontSize: 11, color: '#888', marginBottom: 2 },
  val: { fontSize: 14, fontWeight: 'bold' },
  alertText: { fontSize: 11, color: '#d32f2f', textAlign: 'center', marginTop: 8, backgroundColor: '#ffebee', padding: 4, borderRadius: 4 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cashLabel: { fontSize: 16, color: '#555', fontWeight: '600' },
  cashValue: { fontSize: 20, color: '#2e7d32', fontWeight: '900' },
  hint: { fontSize: 12, color: '#999', marginTop: 5, fontStyle: 'italic' },

  btn: { backgroundColor: '#e3f2fd', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#1565c0', fontWeight: 'bold' }
});
*/

















import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import Card from "../components/Card";

export default function TodaySummaryScreen({ route }) {
  const { user } = route.params; 

  const [summary, setSummary] = useState({
    cashSales: 0,
    mpesaSales: 0,
    bankSales: 0,
    mpesaActual: 0,
    bankActual: 0,
    totalSales: 0,
    unverifiedTransactions: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user && user.businessId) {
        loadTodayData();
    }
  }, [user]);

  async function loadTodayData() {
    if (!user || !user.businessId) return;

    setRefreshing(true);
    
    // 1. Get Start of Today (00:00:00)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0); 

    console.log("📊 GENERATING REPORT FOR:", user.email);

    try {
      // --- QUERY 1: PAYMENTS (What John Recorded) ---
      const paymentsQ = query(
        collection(db, "payments"),
        where("businessId", "==", user.businessId),
        where("createdBy", "==", user.uid), 
        where("createdAt", ">=", startOfDay)
      );

      // --- QUERY 2: MPESA LOGS (What SMS Said) ---
      const logsQ = query(
        collection(db, "mpesa_logs"),
        where("businessId", "==", user.businessId),
        where("userId", "==", user.uid), 
        where("createdAt", ">=", startOfDay) 
      );

      const [paymentsSnap, logsSnap] = await Promise.all([
        getDocs(paymentsQ),
        getDocs(logsQ)
      ]);

      // --- CALCULATE TOTALS ---
      let cash = 0, mpesaRecorded = 0, bankRecorded = 0, unverified = 0;
      let mpesaActual = 0, bankActual = 0;

      // 1. Process App Entries
      paymentsSnap.forEach((doc) => {
        try {
            const d = doc.data();
            const amt = Number(d.amount || 0); 
            const method = (d.paymentMethod || "cash").toLowerCase();
            
            if (method === "cash") {
              cash += amt;
            } else if (method === "mpesa") {
              mpesaRecorded += amt;
              if (!d.isVerified) unverified++;
            } else if (method === "bank") {
              bankRecorded += amt;
              if (!d.isVerified) unverified++;
            }
        } catch (e) {
            console.warn("Skipping bad payment record", doc.id);
        }
      });

      // 2. Process SMS Logs
      logsSnap.forEach((doc) => {
        try {
            const d = doc.data();
            const amt = Number(d.amount || 0);
            const type = (d.type || "mpesa").toLowerCase();

            if (type === 'bank') {
                bankActual += amt;
            } else {
                mpesaActual += amt;
            }
        } catch (e) {
            console.warn("Skipping bad log record", doc.id);
        }
      });

      setSummary({
        cashSales: cash,
        mpesaSales: mpesaRecorded,
        bankSales: bankRecorded,
        mpesaActual: mpesaActual,
        bankActual: bankActual,
        totalSales: cash + mpesaRecorded + bankRecorded,
        unverifiedTransactions: unverified,
      });

    } catch (error) {
      console.error("🔥 REPORT ERROR:", error);
      if (error.message.includes("index")) {
        // Just log it, don't crash. Firebase will email you the link.
        console.warn("Missing Index. Check console for link.");
      } else {
        // Alert.alert("Error", error.message); // Optional: Comment out to be less annoying
      }
    } finally {
      setRefreshing(false);
    }
  }

  // Variances
  const mpesaVariance = summary.mpesaActual - summary.mpesaSales;
  const bankVariance = summary.bankActual - summary.bankSales;

  // --- REUSABLE ROW COMPONENT ---
  const AuditRow = ({ title, actual, recorded, variance }) => (
    <View style={styles.auditContainer}>
      <Text style={styles.auditTitle}>{title}</Text>
      <View style={styles.auditDetails}>
        <View style={styles.col}>
            <Text style={styles.label}>Actual (SMS)</Text>
            <Text style={[styles.val, {color: '#2e7d32'}]}>KES {actual.toLocaleString()}</Text>
        </View>
        <View style={styles.col}>
            <Text style={styles.label}>Recorded (App)</Text>
            <Text style={[styles.val, {color: '#1565c0'}]}>KES {recorded.toLocaleString()}</Text>
        </View>
        <View style={styles.col}>
            <Text style={styles.label}>Diff</Text>
            <Text style={[styles.val, { color: variance === 0 ? '#aaa' : (variance > 0 ? '#d32f2f' : '#f57c00') }]}>
               {variance > 0 ? "+" : ""}{variance.toLocaleString()}
            </Text>
        </View>
      </View>
      {variance > 0 && <Text style={styles.alertText}>⚠️ Unrecorded Money Found!</Text>}
      {variance < 0 && <Text style={styles.alertText}>⚠️ Sales Recorded without SMS!</Text>}
    </View>
  );

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadTodayData} />}
    >
      <View style={styles.headerBox}>
        <Text style={styles.header}>My Shift Report</Text>
        <Text style={styles.date}>{new Date().toDateString()}</Text>
      </View>

      {/* 1. TOTALS CARD */}
      <View style={styles.mainCard}>
        <Text style={styles.totalLabel}>TOTAL SALES COLLECTED</Text>
        <Text style={styles.totalValue}>KES {summary.totalSales.toLocaleString()}</Text>
        <View style={styles.pillContainer}>
            <View style={styles.pill}><Text style={styles.pillText}>Cash: {summary.cashSales.toLocaleString()}</Text></View>
            <View style={styles.pill}><Text style={styles.pillText}>Digital: {(summary.mpesaSales + summary.bankSales).toLocaleString()}</Text></View>
        </View>
      </View>

      {/* 2. DIGITAL RECONCILIATION */}
      <Text style={styles.sectionTitle}>RECONCILIATION</Text>
      
      <Card>
        <AuditRow 
            title="📱 M-Pesa Balancing"
            actual={summary.mpesaActual}
            recorded={summary.mpesaSales}
            variance={mpesaVariance}
        />
        <View style={styles.divider}/>
        <AuditRow 
            title="🏦 Bank Balancing"
            actual={summary.bankActual}
            recorded={summary.bankSales}
            variance={bankVariance}
        />
      </Card>

      {/* 3. CASH HANDOVER */}
      <Text style={styles.sectionTitle}>CASH HANDOVER</Text>
      <Card>
        <View style={styles.rowBetween}>
            <Text style={styles.cashLabel}>Expected Cash:</Text>
            <Text style={styles.cashValue}>KES {summary.cashSales.toLocaleString()}</Text>
        </View>
        <Text style={styles.hint}>Count the cash in the drawer. It should match this amount.</Text>
      </Card>

      <TouchableOpacity style={styles.btn} onPress={loadTodayData}>
        <Text style={styles.btnText}>🔄 Refresh Report</Text>
      </TouchableOpacity>
      
      <View style={{height: 30}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f6f7f9" },
  headerBox: { marginBottom: 15 },
  header: { fontSize: 24, fontWeight: "900", color: "#333" },
  date: { fontSize: 14, color: "#666" },
  
  mainCard: { backgroundColor: "#1565c0", padding: 20, borderRadius: 16, alignItems: "center", marginBottom: 20, elevation: 5 },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "bold", letterSpacing: 1 },
  totalValue: { color: "#fff", fontSize: 34, fontWeight: "900", marginVertical: 8 },
  pillContainer: { flexDirection: 'row', gap: 10 },
  pill: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#888', marginBottom: 8, marginTop: 10, paddingLeft: 4 },
  
  auditContainer: { paddingVertical: 5 },
  auditTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  auditDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { alignItems: 'center', flex: 1 },
  label: { fontSize: 11, color: '#888', marginBottom: 2 },
  val: { fontSize: 14, fontWeight: 'bold' },
  alertText: { fontSize: 11, color: '#d32f2f', textAlign: 'center', marginTop: 8, backgroundColor: '#ffebee', padding: 4, borderRadius: 4 },
  
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cashLabel: { fontSize: 16, color: '#555', fontWeight: '600' },
  cashValue: { fontSize: 20, color: '#2e7d32', fontWeight: '900' },
  hint: { fontSize: 12, color: '#999', marginTop: 5, fontStyle: 'italic' },

  btn: { backgroundColor: '#e3f2fd', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#1565c0', fontWeight: 'bold' }
});