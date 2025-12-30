import { 
  View, Text, ScrollView, TextInput, StyleSheet, Modal, TouchableOpacity 
} from "react-native";
import { useEffect, useState } from "react";
import { fetchPaymentsForAccount, createPayment } from "../services/firestore";
import { doc, updateDoc, increment, getDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import PaymentToggle from "../components/PaymentToggle";
import AmountInput from "../components/AmountInput";
import PrimaryButton from "../components/PrimaryButton";
import { formatReceipt, printViaRawBT } from "../utils/receipt";
import ReceiptCard from "../components/ReceiptCard";
import { Share, Linking } from "react-native";
//import { formatReceipt } from "../utils/receipt";
import { DEV_USER } from "../utils/devUser";

export default function AccountDetailScreen({ route, navigation }) {
  // We take the account from params
  const { account: initialAccount } = route.params;

  const [account, setAccount] = useState(initialAccount);
  const [payments, setPayments] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [transactionCode, setTransactionCode] = useState("");
  
  // MODAL STATES
  const [modalVisible, setModalVisible] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    loadPayments();
  }, []);

  async function loadPayments() {
    const data = await fetchPaymentsForAccount(account.id);
    setPayments(data);
    
    // Also refresh account data to get latest paidAmount from DB
    const accSnap = await getDoc(doc(db, "accounts", account.id));
    if (accSnap.exists()) setAccount({ id: accSnap.id, ...accSnap.data() });
  }

  const balance = Number(account.totalAmount || 0) - Number(account.paidAmount || 0);

  async function addPayment() {
    if (!amount || Number(amount) <= 0) return;
    if (method === "mpesa" && !transactionCode) {
        alert("M-Pesa Code required for reconciliation!");
        return;
    }

    const payValue = Number(amount);
    const newBalance = balance - payValue;

    const paymentData = {
      accountId: account.id,
      amount: payValue,
      paymentMethod: method,
      transactionCode: method === "mpesa" ? transactionCode.toUpperCase() : "CASH",
      isVerified: false,
    };

    try {
        // 1. Save Payment
        await createPayment(paymentData, DEV_USER);

        // 2. Update Account
        const accountRef = doc(db, "accounts", account.id);
        await updateDoc(accountRef, {
            paidAmount: increment(payValue),
            status: newBalance <= 0 ? "closed" : "open"
        });

        // 3. TRIGGER THE UPDATED RECEIPT
        setReceiptData({
          businessName: "Your Business Name",
          account: { 
            type: account.type, 
            description: account.description 
          },
          payment: paymentData,
          balanceAfter: newBalance,
        });

        setModalVisible(true);
        setAmount("");
        setTransactionCode("");

    } catch (e) {
        console.error(e);
        alert("Error saving payment");
    }
  }

  const handleShareReceipt = async () => {
    if (!receiptData) return;
    const message = formatReceipt({
      businessName: receiptData.businessName,
      account: receiptData.account,
      payment: receiptData.payment,
      balanceAfter: receiptData.balanceAfter,
    });
    try {
      await Share.share({ message });
    } catch (error) {
      alert("Sharing failed");
    }
  };

  const handleWhatsApp = async () => {
    if (!receiptData) return;
    const message = formatReceipt({
      businessName: receiptData.businessName,
      account: receiptData.account,
      payment: receiptData.payment,
      balanceAfter: receiptData.balanceAfter,
    });
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) { await Linking.openURL(url); } 
    else { alert("WhatsApp not installed"); }
  };

  const handleThermalPrint = () => {
  if (!receiptData) return;

  // 1. Generate the text
  const message = formatReceipt({
    businessName: receiptData.businessName,
    account: receiptData.account,
    payment: receiptData.payment,
    balanceAfter: receiptData.balanceAfter,
  });

  // 2. Send to printer
  printViaRawBT(message);
};

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>{account.description}</Text>
        
        <View style={styles.statsRow}>
          <View>
            <Text style={styles.label}>Total Cost</Text>
            <Text style={styles.value}>KES {account.totalAmount}</Text>
          </View>
          <View>
            <Text style={styles.label}>Remaining</Text>
            <Text style={[styles.value, { color: "red" }]}>KES {balance}</Text>
          </View>
        </View>

        <View style={styles.paymentBox}>
          <Text style={styles.boxTitle}>Record New Payment</Text>
          <AmountInput value={amount} onChange={setAmount} />
          <PaymentToggle value={method} onChange={setMethod} />
          
          {method === 'mpesa' && (
              <TextInput 
                  placeholder="M-Pesa Transaction Code"
                  value={transactionCode}
                  onChangeText={setTransactionCode}
                  style={styles.codeInput}
                  autoCapitalize="characters"
              />
          )}
          
          <PrimaryButton title="Submit Payment" onPress={addPayment} />
        </View>

        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>Recent Payments</Text>
          {/*payments.map(p => (
            <View key={p.id} style={styles.historyCard}>
              <Text style={{ fontWeight: 'bold' }}>KES {p.amount}</Text>
              <Text style={{ color: '#666', fontSize: 12 }}>
                {new Date(p.createdAt?.seconds * 1000).toLocaleDateString()} • {p.paymentMethod.toUpperCase()}
              </Text>
            </View>
          ))*/}
          {payments.map(p => (
  <View key={p.id} style={styles.historyCard}>
    <View style={{ flex: 1 }}>
      <Text style={{ fontWeight: 'bold' }}>KES {p.amount}</Text>
      <Text style={{ color: '#666', fontSize: 12 }}>
        {new Date(p.createdAt?.seconds * 1000).toLocaleDateString()}
      </Text>
    </View>
    
    {/* ADD A SHARE ICON HERE */}
    <TouchableOpacity 
      onPress={() => {
        // Set receiptData for this specific old payment
        setReceiptData({
          businessName: "Your Business Name",
          account: { type: account.type, description: account.description },
          payment: p,
          balanceAfter: "N/A", // Or calculate historical balance
        });
        setModalVisible(true);
      }}
    >
      <Text style={{ color: '#1565c0', fontSize: 12 }}>View Receipt</Text>
    </TouchableOpacity>
  </View>
))}
        </View>
      </ScrollView>

      {/* --- THE UPDATED RECEIPT MODAL --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.successTitle}>✅ Payment Received</Text>
              
              {receiptData && (
                <ReceiptCard 
                  businessName={receiptData.businessName}
                  account={receiptData.account}
                  payment={receiptData.payment}
                  balanceAfter={receiptData.balanceAfter}
                />
              )}

              <TouchableOpacity 
                style={styles.doneButton} 
                onPress={() => {
                  setModalVisible(false);
                  loadPayments();
                  if (receiptData.balanceAfter <= 0) navigation.goBack(); 
                }}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>

              {/* ADD THESE BUTTONS BELOW THE DONE BUTTON */}
              <View style={styles.shareRow}>
                <TouchableOpacity style={styles.printButton} onPress={handleShareReceipt}>
                  <Text style={styles.printButtonText}>Share (SMS)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.printButton} onPress={handleWhatsApp}>
                  <Text style={[styles.printButtonText, { color: '#25D366' }]}>WhatsApp</Text>
                </TouchableOpacity>
              </View>

              
              <TouchableOpacity 
                 style={styles.thermalButton} 
                 onPress={handleThermalPrint}
                >
               <Text style={styles.thermalButtonText}>🖨️ Print Thermal Receipt</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f6f7f9' },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 1 },
  label: { fontSize: 12, color: '#888' },
  value: { fontSize: 18, fontWeight: 'bold' },
  paymentBox: { marginTop: 20, padding: 16, backgroundColor: '#fff', borderRadius: 12 },
  boxTitle: { fontWeight: 'bold', marginBottom: 10 },
  codeInput: { backgroundColor: '#f9fafb', padding: 12, borderRadius: 8, marginVertical: 10, borderWidth: 1, borderColor: '#ddd' },
  historySection: { marginTop: 25, marginBottom: 50 },
  historyTitle: { fontWeight: 'bold', fontSize: 16, marginBottom: 10 },
  historyCard: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#1565c0' },
  
  // MODAL STYLES
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#f6f7f9", borderRadius: 20, padding: 15, maxHeight: "90%" },
  successTitle: { fontSize: 18, fontWeight: "bold", textAlign: "center", marginVertical: 15, color: "#2e7d32" },
  doneButton: { backgroundColor: "#1565c0", padding: 16, borderRadius: 12, alignItems: "center", marginTop: 10 },
  doneButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
  shareRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    marginTop: 15 
  },
  printButton: { padding: 10 },
  printButtonText: { color: '#1565c0', fontWeight: 'bold' },
  thermalButton: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  thermalButtonText: { color: '#333', fontWeight: '600' }
});