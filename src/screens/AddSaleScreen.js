import { 
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  Share, Linking, Alert, Platform, PermissionsAndroid, KeyboardAvoidingView, ActivityIndicator, Image
} from "react-native";
import { useState, useEffect } from "react";
import SmsListener from 'react-native-android-sms-listener'; 
import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS } from '../utils/mpesaParser';
import { formatReceipt, printViaRawBT } from "../utils/receipt";
import SaleTypeToggle from "../components/SaleTypeToggle";
import RetailItems from "../components/RetailItems";
import JobSale from "../components/JobSale";
import PaymentToggle from "../components/PaymentToggle";
import PrimaryButton from "../components/PrimaryButton";
import Card from "../components/Card";
import { createAccount } from "../services/accounts";
import { createPayment } from "../services/firestore";
import ReceiptCard from "../components/ReceiptCard";
import logo from "../assets/dukalogo.png"

export default function AddSaleScreen({ navigation, route }) {
  // 1. Get real user from route params
  const { user } = route.params;

  // --- STATES ---
  const [saleType, setSaleType] = useState("retail");
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState(""); // For Retail Credit
  const [jobName, setJobName] = useState("");
  const [jobTotal, setJobTotal] = useState("");
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [retailCredit, setRetailCredit] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [transactionCode, setTransactionCode] = useState("");
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // --- SMS LISTENER ---
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const requestPermissions = async () => {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      } catch (err) { console.warn(err); }
    };
    requestPermissions();

    const subscription = SmsListener.addListener((message) => {
      const isMpesa = message.originatingAddress.toLowerCase().includes("mpesa") || 
                      message.originatingAddress.includes("150");

      if (isMpesa) {
        const data = parseMpesaSMS(message.body);
        if (data) {
          setPaymentMethod("mpesa");
          setTransactionCode(data.transactionCode);
          setIsAutoFilled(true); 
          if (saleType === "job") setPaid(String(data.amount));
          
          if (user) processIncomingSMS(message.body, message.originatingAddress, user);
          Alert.alert("M-Pesa Received", `Code: ${data.transactionCode}\nAmount: ${data.amount}`);
        }
      }
    });

    return () => subscription.remove();
  }, [saleType, user]);

  // --- HELPERS ---
  function calculateRetailTotal() {
    return items.reduce((sum, i) => sum + Number(i.qty || 0) * Number(i.price || 0), 0);
  }

  function resetForm() {
    setItems([]);
    setCustomerName("");
    setJobName("");
    setJobTotal("");
    setPaid("");
    setTransactionCode("");
    setIsAutoFilled(false);
    setRetailCredit(false);
    setPaymentMethod("cash");
    setModalVisible(false);
  }

  // --- SAVE LOGIC ---
  async function handleSave() {
    if (saleType === "job" && (!jobName || !jobTotal)) {
      alert("Please enter a Job Name and Total Amount.");
      return;
    }

    if (saleType === "retail" && retailCredit && !customerName) {
      alert("Please enter the Customer's Name for this credit sale.");
      return;
    }

    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && !transactionCode) {
      alert(`Please enter the ${paymentMethod.toUpperCase()} code.`);
      return;
    }

    setIsLoading(true);

    try {
      const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
      const amountPaid = saleType === "retail" 
        ? (retailCredit ? Number(paid || 0) : total) 
        : Number(paid || 0);

      const accountDescription = saleType === "job" 
        ? jobName 
        : (retailCredit ? `Credit: ${customerName}` : "Retail Sale");
        
      const balanceAfter = total - amountPaid;
      const bizName = user.businessName || "My Shop"; 

      if (saleType === "retail" && !retailCredit) {
        // SCENARIO 1: FULLY PAID RETAIL SALE
        const receiptText = formatReceipt({
          businessName: bizName,
          account: { type: "retail", description: "Retail Sale" },
          payment: { amount: total, paymentMethod },
          balanceAfter: 0,
        });

        await createPayment({ 
            accountId: null, 
            amount: total, 
            paymentMethod, 
            transactionCode: paymentMethod === 'cash' ? 'CASH' : transactionCode.toUpperCase(),
            isVerified: paymentMethod === 'cash',
            receiptText 
          }, user
        );
      } else {
        // SCENARIO 2: JOB ORDER OR RETAIL CREDIT
        const accountId = await createAccount({
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
          }, user
        );

        if (amountPaid > 0 || retailCredit) {
          const receiptText = formatReceipt({
            businessName: bizName,
            account: { type: saleType, description: accountDescription },
            payment: { amount: amountPaid, paymentMethod },
            balanceAfter: balanceAfter,
          });

          await createPayment({ 
              accountId, 
              amount: amountPaid, 
              paymentMethod, 
              transactionCode: paymentMethod === 'cash' ? 'CASH' : transactionCode.toUpperCase(),
              isVerified: paymentMethod === 'cash',
              receiptText 
            }, user
          );
        }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
      });

      setIsLoading(false);
      setModalVisible(true);
    } catch (error) {
      console.error("Save failed:", error);
      alert("Error saving: " + error.message);
    }
  }

  // --- ACTIONS ---
  const handleShareReceipt = async () => {
    if (!receiptData) return;
    const message = formatReceipt(receiptData);
    try { await Share.share({ message }); } catch (error) { alert("Sharing failed"); }
  };

  const handleWhatsApp = async () => {
    if (!receiptData) return;
    const message = formatReceipt(receiptData);
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) { await Linking.openURL(url); } else { alert("WhatsApp not installed"); }
  };

  const handleThermalPrint = () => {
    if (!receiptData) return;
    const message = formatReceipt(receiptData);
    printViaRawBT(message);
  };

  // --- RENDER ---
  return (
     <KeyboardAvoidingView 
    style={{ flex: 1 }}
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0} // Adjust offset if you have a header
  >
    <View style={{ flex: 1, backgroundColor: "#f6f7f9" }}>
      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }} 
        keyboardShouldPersistTaps="handled"
      >
        {/*<Text style={styles.screenTitle}>New Sale</Text>*/}

        <Card>
          <SaleTypeToggle value={saleType} onChange={setSaleType} />
        </Card>

        <Card>
          {saleType === "retail" ? (
            <View>
              <RetailItems items={items} setItems={setItems} />
              
              <TouchableOpacity onPress={() => setRetailCredit(!retailCredit)} style={styles.creditToggleButton}>
                <Text style={[styles.creditToggleText, retailCredit && { color: '#d32f2f' }]}>
                  {retailCredit ? "⚠️ CREDIT SALE ACTIVE" : "💳 Convert to Credit Sale?"}
                </Text>
              </TouchableOpacity>

              {retailCredit && (
                <View style={styles.creditSection}>
                  <Text style={styles.inputLabel}>Customer Name (Debtor)</Text>
                  <TextInput
                    placeholder="Enter customer name..."
                    value={customerName}
                    onChangeText={setCustomerName}
                    style={styles.amountPaidInput}
                  />
                  
                  <Text style={[styles.inputLabel, { marginTop: 15 }]}>Deposit Paid Now (Optional)</Text>
                  <TextInput
                    placeholder="0.00"
                    keyboardType="numeric"
                    value={paid}
                    onChangeText={setPaid}
                    style={styles.amountPaidInput}
                  />
                </View>
              )}
            </View>
          ) : (
            <JobSale
              jobName={jobName}
              setJobName={setJobName}
              jobTotal={jobTotal}
              setJobTotal={setJobTotal}
              paid={paid}
              setPaid={setPaid}
            />
          )}
        </Card>

        <Card>
          <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
          {(paymentMethod === "mpesa" || paymentMethod === "bank") && (
            <TextInput
              placeholder={`Enter ${paymentMethod.toUpperCase()} Ref Code`}
              value={transactionCode}
              onChangeText={setTransactionCode}
              style={styles.amountPaidInput}
              autoCapitalize="characters"
            />
          )}
        </Card>

        {isAutoFilled && (
          <View style={styles.autoFilledWarning}>
            <Text style={styles.autoFilledText}>
              ✅ M-Pesa Code {transactionCode} Detected!
            </Text>
          </View>
        )}
        
        <PrimaryButton title="Save & Process Sale" onPress={handleSave} />
      </ScrollView>

       {/* --- LOADING MODAL WITH LOGO --- */}
      <Modal transparent={true} visible={isLoading} animationType="fade">
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
              <Image source={logo} style={styles.loadingLogo} />
              <ActivityIndicator size="large" color="#1565c0" />
              <Text style={styles.loadingText}>Processing Sale...</Text>
              <Text style={styles.loadingSubText}>Updating records...</Text>
            </View>
          </View>
        </Modal>

      {/* SUCCESS MODAL */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.successTitle}>✅ Sale Recorded Successfully</Text>
              
              {receiptData && (
                <ReceiptCard 
                  businessName={receiptData.businessName}
                  account={receiptData.account}
                  payment={receiptData.payment}
                  balanceAfter={receiptData.balanceAfter}
                />
              )}

              <TouchableOpacity style={styles.doneButton} onPress={() => { resetForm(); navigation.navigate("Summary"); }}>
                <Text style={styles.doneButtonText}>Finish & New Sale</Text>
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.printButton} onPress={handleShareReceipt}>
                  <Text style={styles.printButtonText}>Share SMS</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.printButton} onPress={handleWhatsApp}>
                  <Text style={[styles.printButtonText, { color: '#25D366' }]}>WhatsApp</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.thermalButton} onPress={handleThermalPrint}>
                <Text style={styles.thermalButtonText}>🖨️ Print Thermal Receipt</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenTitle: { fontSize: 24, fontWeight: "900", color: '#333', marginBottom: 16 },
  creditToggleButton: { marginTop: 20, padding: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  creditToggleText: { color: "#1565c0", fontSize: 13, fontWeight: "800", textAlign: 'center' },
  creditSection: { marginTop: 10, backgroundColor: '#fff5f5', padding: 15, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: '#d32f2f' },
  inputLabel: { fontSize: 11, fontWeight: '900', color: '#888', marginBottom: 5, uppercase: true },
  amountPaidInput: { backgroundColor: "#fff", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#f6f7f9", borderRadius: 25, padding: 20, maxHeight: "90%" },
  successTitle: { fontSize: 20, fontWeight: "900", textAlign: "center", marginVertical: 15, color: "#2e7d32" },
  doneButton: { backgroundColor: "#1565c0", padding: 18, borderRadius: 15, alignItems: "center", marginTop: 15 },
  doneButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
  actionRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 15 },
  printButton: { padding: 10 },
  printButtonText: { color: "#1565c0", fontSize: 14, fontWeight: "bold" },
  thermalButton: { marginTop: 25, borderWidth: 1, borderColor: '#ccc', padding: 15, borderRadius: 12, alignItems: 'center', backgroundColor: '#fff' },
  thermalButtonText: { color: '#333', fontWeight: 'bold' },
  autoFilledWarning: { backgroundColor: "#e8f5e9", padding: 15, borderRadius: 12, borderWidth: 1, borderColor: "#a5d6a7", marginVertical: 10 },
  autoFilledText: { color: "#2e7d32", fontWeight: "bold", textAlign: "center", fontSize: 14 },
   loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)", // Semi-transparent black background
    justifyContent: "center",
    alignItems: "center",
  },
  loadingBox: {
    backgroundColor: "white",
    padding: 25,
    borderRadius: 15,
    alignItems: "center",
    elevation: 5, // Android shadow
    shadowColor: "#000", // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minWidth: 180,
  },
  loadingLogo: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
    marginBottom: 15,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 18,
    fontWeight: "bold",
    color: "#333"
  },
  loadingSubText: {
    marginTop: 5,
    fontSize: 14,
    color: "#666"
  }
});




























/*import { 
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  Share, Linking, Alert, Platform, PermissionsAndroid
} from "react-native";
import { useState, useEffect } from "react";
import SmsListener from 'react-native-android-sms-listener'; 
import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS } from '../utils/mpesaParser';
import { formatReceipt, printViaRawBT } from "../utils/receipt";
import SaleTypeToggle from "../components/SaleTypeToggle";
import RetailItems from "../components/RetailItems";
import JobSale from "../components/JobSale";
import PaymentToggle from "../components/PaymentToggle";
import PrimaryButton from "../components/PrimaryButton";
import Card from "../components/Card";
// import { DEV_USER } from "../utils/devUser"; // 🗑️ REMOVED: Not needed anymore
import { createAccount } from "../services/accounts";
import { createPayment } from "../services/firestore";
import ReceiptCard from "../components/ReceiptCard";

export default function AddSaleScreen({ navigation, route }) {
  // 1. Get real user from route params
  const { user } = route.params;

  const [saleType, setSaleType] = useState("retail");
  const [items, setItems] = useState([]);
  const [jobName, setJobName] = useState("");
  const [jobTotal, setJobTotal] = useState("");
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [retailCredit, setRetailCredit] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [transactionCode, setTransactionCode] = useState("");
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [customerName, setCustomerName] = useState(""); 
 

  useEffect(() => {
  if (Platform.OS !== 'android') return;

  const subscription = SmsListener.addListener((message) => {
    // 1. Log EVERY message to see if it's even hitting the app
    console.log("📩 Raw SMS Received from:", message.originatingAddress);

    // 2. Relax the sender check (Sometimes it's 'MPESA', 'M-PESA', or '150')
    const isMpesa = message.originatingAddress.toLowerCase().includes("mpesa") || 
                    message.originatingAddress.includes("150");

    if (isMpesa) {
      console.log("✅ M-Pesa Sender Confirmed. Body:", message.body);

      const data = parseMpesaSMS(message.body);
      
      if (data) {
        console.log("🎯 Parsed Data:", data);

        // Update UI State
        setPaymentMethod("mpesa");
        setTransactionCode(data.transactionCode);
        setIsAutoFilled(true); 
        if (saleType === "job") setPaid(String(data.amount));

        // Save to Firestore (Database)
        if (user) {
          processIncomingSMS(message.body, message.originatingAddress, user);
        } else {
          console.warn("⚠️ User not loaded yet, SMS log not saved to DB");
        }

        Alert.alert("M-Pesa Received", `Code: ${data.transactionCode}\nAmount: ${data.amount}`);
      } else {
        console.log("❌ Parser returned null. Check your Regex.");
      }
    }
  });

  return () => subscription.remove();
}, [saleType, user]);

  function calculateRetailTotal() {
    return items.reduce(
      (sum, i) => sum + Number(i.qty || 0) * Number(i.price || 0),
      0
    );
  }

  function resetForm() {
    setItems([]);
    setJobName("");
    setJobTotal("");
    setPaid("");
    setCustomerName("");
    setTransactionCode("");
    setIsAutoFilled(false);
    setRetailCredit(false);
    setPaymentMethod("cash");
    setModalVisible(false);
  }

  /*async function handleSave() {
    if (saleType === "job" && (!jobName || !jobTotal)) {
      alert("Please enter a Job Name and Total Amount.");
      return;
    }

    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && !transactionCode) {
      alert(`Please enter the ${paymentMethod.toUpperCase()} code.`);
      return;
    }

    try {
      const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
      const amountPaid = saleType === "retail" 
        ? (retailCredit ? Number(paid || 0) : total) 
        : Number(paid || 0);

      const accountDescription = saleType === "job" ? jobName : (retailCredit ? "Retail Credit Sale" : "Retail Sale");
      const balanceAfter = total - amountPaid;
      const bizName = user.businessName || "My Shop"; 

      if (saleType === "retail" && !retailCredit) {
        const receiptText = formatReceipt({
          businessName: bizName,
          account: { type: "retail", description: "Retail Sale" },
          payment: { amount: total, paymentMethod },
          balanceAfter: 0,
        });

        await createPayment(
          { 
            accountId: null, 
            amount: total, 
            paymentMethod, 
            transactionCode: paymentMethod === 'cash' ? 'CASH' : transactionCode.toUpperCase(),
            isVerified: paymentMethod === 'cash',
            receiptText 
          },
          user // Using real user
        );
      } else {
        const accountId = await createAccount(
          {
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
          },
          user // Using real user
        );

        if (amountPaid > 0) {
          const receiptText = formatReceipt({
            businessName: bizName,
            account: { type: saleType, description: accountDescription },
            payment: { amount: amountPaid, paymentMethod },
            balanceAfter: balanceAfter,
          });

          await createPayment(
            { 
              accountId, 
              amount: amountPaid, 
              paymentMethod, 
              transactionCode: paymentMethod === 'cash' ? 'CASH' : transactionCode.toUpperCase(),
              isVerified: paymentMethod === 'cash',
              receiptText 
            },
            user
          );
        }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
      });

      setModalVisible(true);

    } catch (error) {
      console.error("Save failed:", error);
      alert("Error saving: " + error.message);
    }
  }*/ /*

    async function handleSave() {
    // Validation for Job
    if (saleType === "job" && (!jobName || !jobTotal)) {
      alert("Please enter a Job Name and Total Amount.");
      return;
    }

    // Validation for Retail Credit (The Name Check)
    if (saleType === "retail" && retailCredit && !customerName) {
      alert("Please enter the Customer's Name for this credit sale.");
      return;
    }

    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && !transactionCode) {
      alert(`Please enter the ${paymentMethod.toUpperCase()} code.`);
      return;
    }

    try {
      const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
      const amountPaid = saleType === "retail" 
        ? (retailCredit ? Number(paid || 0) : total) 
        : Number(paid || 0);

      // SMART DESCRIPTION: For retail credit, use the customer name
      const accountDescription = saleType === "job" 
        ? jobName 
        : (retailCredit ? `Credit: ${customerName}` : "Retail Sale");
        
      const balanceAfter = total - amountPaid;
      const bizName = user.businessName || "My Shop"; 

      if (saleType === "retail" && !retailCredit) {
        // ... Logic for Normal Paid Retail Sale ...
        const receiptText = formatReceipt({
          businessName: bizName,
          account: { type: "retail", description: "Retail Sale" },
          payment: { amount: total, paymentMethod },
          balanceAfter: 0,
        });

        await createPayment({ 
            accountId: null, 
            amount: total, 
            paymentMethod, 
            transactionCode: paymentMethod === 'cash' ? 'CASH' : transactionCode.toUpperCase(),
            isVerified: paymentMethod === 'cash',
            receiptText 
          }, user
        );
      } else {
        // Logic for Jobs OR Retail Credit (Creates an Account/Ledger entry)
        const accountId = await createAccount({
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
          }, user
        );

        if (amountPaid > 0 || retailCredit) {
          const receiptText = formatReceipt({
            businessName: bizName,
            account: { type: saleType, description: accountDescription },
            payment: { amount: amountPaid, paymentMethod },
            balanceAfter: balanceAfter,
          });

          await createPayment({ 
              accountId, 
              amount: amountPaid, 
              paymentMethod, 
              transactionCode: paymentMethod === 'cash' ? 'CASH' : transactionCode.toUpperCase(),
              isVerified: paymentMethod === 'cash',
              receiptText 
            }, user
          );
        }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
      });

      setModalVisible(true);
    } catch (error) {
      console.error("Save failed:", error);
      alert("Error saving: " + error.message);
    }
  }


  const handleShareReceipt = async () => {
    if (!receiptData) return;
    const message = formatReceipt(receiptData);
    try {
      await Share.share({ message });
    } catch (error) {
      alert("Sharing failed");
    }
  };

  const handleWhatsApp = async () => {
    if (!receiptData) return;
    const message = formatReceipt(receiptData);
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) { 
      await Linking.openURL(url); 
    } else { 
      alert("WhatsApp not installed"); 
    }
  };

  const handleThermalPrint = () => {
    if (!receiptData) return;
    const message = formatReceipt(receiptData);
    printViaRawBT(message);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#f6f7f9" }}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
     

        <Card>
          <SaleTypeToggle value={saleType} onChange={setSaleType} />
        </Card>

        <Card>
          {saleType === "retail" ? (
            <RetailItems items={items} setItems={setItems} />
          ) : (
            <JobSale
              key={jobName + jobTotal}
              jobName={jobName}
              setJobName={setJobName}
              jobTotal={jobTotal}
              setJobTotal={setJobTotal}
              paid={paid}
              setPaid={setPaid}
            />
          )}
        </Card>

        <Card>
          <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
          
          {(paymentMethod === "mpesa" || paymentMethod === "bank") && (
            <TextInput
              placeholder={`Enter ${paymentMethod.toUpperCase()} Ref Code`}
              value={transactionCode}
              onChangeText={setTransactionCode}
              style={styles.amountPaidInput}
              autoCapitalize="characters"
            />
          )}

          {saleType === "retail" && (
            <>
              <TouchableOpacity onPress={() => setRetailCredit(!retailCredit)}>
                <Text style={styles.creditToggleText}>
                  {retailCredit ? "Retail: Credit Sale" : "Retail: Paid in Full"}
                </Text>
              </TouchableOpacity>

              {retailCredit && (
                <TextInput
                  placeholder="Amount Paid"
                  keyboardType="numeric"
                  value={paid}
                  onChangeText={setPaid}
                  style={styles.amountPaidInput}
                />
              )}
            </>
          )}
        </Card>
           {isAutoFilled && (
  <View style={styles.autoFilledWarning}>
    <Text style={styles.autoFilledText}>
      ⚠️ M-Pesa Code {transactionCode} Detected! 
      Please click "Save Sale" to link it to this record.
    </Text>
  </View>
)}
        <PrimaryButton title="Save Sale" onPress={handleSave} />
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.successTitle}>✅ Sale Saved Successfully</Text>
              
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
                  resetForm();
                  navigation.navigate("Summary");
                }}
              >
                <Text style={styles.doneButtonText}>Done & Clear</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10 }}>
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
  creditToggleText: { color: "#1565c0", marginBottom: 10, marginTop: 10, fontSize: 16, fontWeight: "600" },
  amountPaidInput: { backgroundColor: "#f9fafb", padding: 14, borderRadius: 10, marginTop: 10, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#f6f7f9", borderRadius: 20, padding: 15, maxHeight: "90%" },
  successTitle: { fontSize: 18, fontWeight: "bold", textAlign: "center", marginVertical: 15, color: "#2e7d32" },
  doneButton: { backgroundColor: "#1565c0", padding: 16, borderRadius: 12, alignItems: "center", marginTop: 10 },
  doneButtonText: { color: "white", fontSize: 16, fontWeight: "bold" },
  printButton: { padding: 16, alignItems: "center", marginBottom: 10 },
  printButtonText: { color: "#1565c0", fontSize: 14, fontWeight: "600" },
  thermalButton: { marginTop: 20, borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 10, alignItems: 'center', backgroundColor: '#fff' },
  thermalButtonText: { color: '#333', fontWeight: '600' },
  autoFilledWarning: {
    backgroundColor: "#fff3e0", 
    padding: 15, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: "#ffb74d", 
    marginVertical: 10 
  },
  autoFilledText: {
    color: "#e65100", 
    fontWeight: "bold", 
    textAlign: "center",
    fontSize: 14
  }
});*/
