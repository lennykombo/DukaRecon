import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, 
  KeyboardAvoidingView, Platform, ActivityIndicator, PermissionsAndroid 
} from "react-native";
import { useState, useEffect } from "react";
import SmsListener from 'react-native-android-sms-listener'; 
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";
import PaymentToggle from "../components/PaymentToggle";
// IMPORT THE NEW PARSER
import { parseMpesaExpense } from "../utils/mpesaParser"; 

export default function AddExpenseScreen({ navigation, route }) {
  const { user } = route.params;
  
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loading, setLoading] = useState(false);
  const [autoCode, setAutoCode] = useState(""); // To track the detected code

  // --- SMS LISTENER FOR EXPENSES ---
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // 1. Ask Permission
    const requestPermissions = async () => {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      } catch (err) { console.warn(err); }
    };
    requestPermissions();

    // 2. Listen
    const subscription = SmsListener.addListener((message) => {
      const sender = message.originatingAddress.toUpperCase();
      
      // Only listen to MPESA for expenses
      if (sender.includes("MPESA") || sender.includes("150")) {
        const data = parseMpesaExpense(message.body);
        
        if (data) {
          // Auto-fill the form
          setAmount(String(data.amount));
          setDescription(data.description); // e.g., "Paid to KPLC"
          setPaymentMethod("mpesa");
          setAutoCode(data.transactionCode);

          Alert.alert(
            "Expense Detected", 
            `Code: ${data.transactionCode}\nAmount: ${data.amount}\nReason: ${data.description}`
          );
        }
      }
    });

    return () => subscription.remove();
  }, []);

  const handleSave = async () => {
    if (!description || !amount) {
      return Alert.alert("Missing Info", "Please enter a description and amount.");
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "expenses"), {
        businessId: user.businessId,
        userId: user.uid,
        userName: user.name || "Attendant",
        amount: parseFloat(amount),
        description: description,
        paymentMethod: paymentMethod, 
        transactionCode: paymentMethod === 'mpesa' ? autoCode : null, // Save code if mpesa
        createdAt: serverTimestamp(),
      });

      Alert.alert("Success", "Expense recorded.");
      navigation.goBack();
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.header}>Record Expense</Text>
        
        <View style={styles.card}>
          <Text style={styles.label}>What was this for?</Text>
          <TextInput 
            style={styles.input} 
            placeholder="e.g. Boda Boda, Lunch, Airtime" 
            placeholderTextColor="#999"
            value={description}
            onChangeText={setDescription}
          />

          <Text style={styles.label}>Amount (KES)</Text>
          <TextInput 
            style={styles.input} 
            placeholder="0.00" 
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />

          <Text style={styles.label}>Source of Funds</Text>
          <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
          
          {/* Show Code if detected */}
          {autoCode ? (
            <Text style={{ color: 'green', fontSize: 12, marginTop: 5 }}>
              ✅ Linked to M-Pesa: {autoCode}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save Expense</Text>}
        </TouchableOpacity>
        
        <Text style={styles.hint}>
          💡 Tip: Make an M-Pesa payment and this form will auto-fill!
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f6f7f9", flexGrow: 1 },
  header: { fontSize: 24, fontWeight: "900", color: "#333", marginBottom: 20 },
  card: { backgroundColor: "#fff", padding: 20, borderRadius: 15, marginBottom: 20 },
  label: { fontSize: 12, fontWeight: "bold", color: "#666", marginBottom: 8, textTransform: "uppercase" },
  input: { backgroundColor: "#f9f9f9", padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: "#eee", color: "#333" },
  saveBtn: { backgroundColor: "#d32f2f", padding: 18, borderRadius: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  hint: { textAlign: 'center', color: '#888', fontSize: 12, marginTop: 10 }
});