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
























/*import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../services/firebase";
import Card from "../components/Card";

export default function TodaySummaryScreen({ route }) {

  const { user } = route.params; 

  const [summary, setSummary] = useState({
    cashSales: 0,
    mpesaSales: 0,
    totalSales: 0,
    unverifiedMpesa: 0, // Transaction codes entered but not yet matched by SMS
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTodayData();
  }, [user]);

  // Add Timestamp to your imports if you use it, 
// but for the query, a native Date object works best.

async function loadTodayData() {
  // 1. Guard: If user or businessId is missing, don't query (avoids Permission Denied)
  if (!user || !user.businessId) {
    console.log("❌ No Business ID found for user:", user?.uid);
    return;
  }

  setRefreshing(true);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0); 

  try {
    const q = query(
      collection(db, "payments"),
      where("businessId", "==", user.businessId), // The "Key" that unlocks the door
      where("createdAt", ">=", startOfDay)
    );

    const snap = await getDocs(q);
    let cash = 0;
    let mpesa = 0;
    let unverified = 0;

    console.log("Documents found:", snap.size); // Debugging line

    snap.forEach((doc) => {
  const data = doc.data();
  // Check both possible field names
  const amount = Number(data.amount || data.paidAmount || 0);
  
  if (data.paymentMethod === "cash") {
    cash += amount;
  } else if (data.paymentMethod === "mpesa") {
    mpesa += amount;
    if (data.isVerified === false) unverified += 1;
  }
});

    setSummary({
      cashSales: cash,
      mpesaSales: mpesa,
      totalSales: cash + mpesa,
      unverifiedMpesa: unverified,
    });
  } catch (error) {
    console.error("Summary Load Error:", error);
  } finally {
    setRefreshing(false);
  }
}

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadTodayData} />}
    >
      <Text style={styles.header}>End of Day Report</Text>
      <Text style={styles.date}>{new Date().toDateString()}</Text>

      {/* Main Totals *//*
      <View style={styles.mainCard}>
        <Text style={styles.totalLabel}>Total Sales Today</Text>
        <Text style={styles.totalValue}>KES {summary.totalSales.toLocaleString()}</Text>
      </View>

      <View style={styles.row}>
        <Card style={styles.halfCard}>
          <Text style={styles.cardLabel}>💵 Cash Expected</Text>
          <Text style={styles.cardValue}>KES {summary.cashSales.toLocaleString()}</Text>
        </Card>
        <Card style={styles.halfCard}>
          <Text style={styles.cardLabel}>📱 M-Pesa Expected</Text>
          <Text style={styles.cardValue}>KES {summary.mpesaSales.toLocaleString()}</Text>
        </Card>
      </View>

      {/* RECONCILIATION SECTION (The Theft Detector) *//*
      <View style={[styles.reconBox, summary.unverifiedMpesa > 0 ? styles.warningBox : styles.successBox]}>
        <Text style={styles.reconTitle}>Reconciliation Status</Text>
        
        {summary.unverifiedMpesa > 0 ? (
          <View>
            <Text style={styles.warningText}>
              ⚠️ {summary.unverifiedMpesa} M-Pesa transactions are UNVERIFIED.
            </Text>
            <Text style={styles.subWarning}>
              Ensure you have typed the correct codes from the Safaricom messages.
            </Text>
          </View>
        ) : (
          <Text style={styles.successText}>
            ✅ All M-Pesa transactions matched. System is balanced.
          </Text>
        )}
      </View>

      <TouchableOpacity style={styles.syncButton} onPress={loadTodayData}>
        <Text style={styles.syncButtonText}>Refresh Totals</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f6f7f9" },
  header: { fontSize: 24, fontWeight: "bold", color: "#333" },
  date: { fontSize: 14, color: "#777", marginBottom: 20 },
  mainCard: { 
    backgroundColor: "#1565c0", 
    padding: 25, 
    borderRadius: 15, 
    alignItems: "center",
    marginBottom: 15 
  },
  totalLabel: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  totalValue: { color: "#fff", fontSize: 32, fontWeight: "bold", marginTop: 5 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  halfCard: { width: "48%", padding: 15 },
  cardLabel: { fontSize: 12, color: "#777", marginBottom: 5 },
  cardValue: { fontSize: 16, fontWeight: "bold", color: "#333" },
  reconBox: { marginTop: 20, padding: 20, borderRadius: 12 },
  successBox: { backgroundColor: "#e8f5e9", borderWidth: 1, borderColor: "#c8e6c9" },
  warningBox: { backgroundColor: "#fff3e0", borderWidth: 1, borderColor: "#ffe0b2" },
  reconTitle: { fontWeight: "bold", marginBottom: 10, fontSize: 16 },
  successText: { color: "#2e7d32", fontWeight: "600" },
  warningText: { color: "#e65100", fontWeight: "700" },
  subWarning: { color: "#666", fontSize: 12, marginTop: 5 },
  syncButton: { marginTop: 30, padding: 15, alignItems: "center" },
  syncButtonText: { color: "#1565c0", fontWeight: "bold" }
}); */