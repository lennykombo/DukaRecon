import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { useState, useEffect } from "react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../services/firebase";
import { DEV_USER } from "../utils/devUser";
import Card from "../components/Card";

export default function TodaySummaryScreen() {
  const [summary, setSummary] = useState({
    cashSales: 0,
    mpesaSales: 0,
    totalSales: 0,
    unverifiedMpesa: 0, // Transaction codes entered but not yet matched by SMS
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTodayData();
  }, []);

  // Add Timestamp to your imports if you use it, 
// but for the query, a native Date object works best.

async function loadTodayData() {
  setRefreshing(true);
  
  // 1. Create a native JS Date object for the start of today
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0); 

  try {
    // 2. IMPORTANT: Remove .toISOString()
    // Firestore will automatically handle the Date object comparison
    const q = query(
      collection(db, "payments"),
      where("businessId", "==", DEV_USER.businessId),
      where("createdAt", ">=", startOfDay) // <--- USE THE DATE OBJECT DIRECTLY
    );

    const snap = await getDocs(q);
    let cash = 0;
    let mpesa = 0;
    let unverified = 0;

    console.log("Documents found:", snap.size); // Debugging line

    snap.forEach((doc) => {
      const data = doc.data();
      // Use Number() to ensure math works even if data was saved as string
      const amount = Number(data.amount || 0);
      
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

      {/* Main Totals */}
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

      {/* RECONCILIATION SECTION (The Theft Detector) */}
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
});