import { 
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  Share, Linking, Alert, Platform, PermissionsAndroid, KeyboardAvoidingView, 
  ActivityIndicator, Image, Keyboard, AppState 
} from "react-native";
import { useState, useEffect, useRef } from "react"; 
import SmsListener from 'react-native-android-sms-listener'; 
import BackgroundService from 'react-native-background-actions'; 
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Firebase Imports
import { 
  collection, query, where, getDocs, orderBy, limit, doc, updateDoc 
} from "firebase/firestore"; 
import { db } from "../services/firebase"; 

import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS, parseBankSMS, parseGenericPayment } from '../utils/mpesaParser';
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
import logo from "../assets/dukalogo.png";

// --- IMPORT THE REAL BACKGROUND LISTENER ---
import { startBackgroundListener } from '../services/backgroundService'; 

export default function AddSaleScreen({ navigation, route }) {
  const { user } = route.params;

  // --- REFS ---
  const processedCodes = useRef(new Set());
  const appState = useRef(AppState.currentState);

  // --- STATES ---
  const [saleType, setSaleType] = useState("retail");
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState(""); 
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

  // --- PENDING PAYMENTS LIST STATE ---
  const [pendingPayments, setPendingPayments] = useState([]); 
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);

  // --- 1. START BACKGROUND SERVICE ---
  useEffect(() => {
    const initService = async () => {
      console.log("🔄 Initializing Background Service...");
      if (user && user.businessId) {
          try {
            await startBackgroundListener(user);
            console.log("✅ Background Service Triggered via AddSaleScreen");
          } catch (err) {
            console.error("❌ Failed to trigger Background Service:", err);
          }
      } else {
        console.warn("⚠️ User or BusinessID missing. Background service skipped.");
      }
    };
    initService();
  }, [user]);

  // --- 2. CHECK FOR PENDING PAYMENTS ---
  useEffect(() => {
    checkForPendingPayments();
    
    // Refresh list when app comes from background to foreground
    const subscription = AppState.addEventListener("change", nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        console.log("📱 App woke up from background. Refreshing Pending List...");
        checkForPendingPayments();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  async function checkForPendingPayments() {
    if (!user || !user.businessId) {
        console.log("❌ Cannot fetch pending payments: Missing User/BizID");
        return;
    }
    
    try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        console.log(`🔎 Querying 'mpesa_logs' for Business: ${user.businessId}`);
        console.log(`📅 Filtering logs created after: ${startOfToday.toISOString()}`);

        const q = query(
            collection(db, "mpesa_logs"),
            where("businessId", "==", user.businessId),
            where("status", "==", "unmatched"),
            where("createdAt", ">=", startOfToday),
            orderBy("createdAt", "desc"),
            limit(10) 
        );

        const snapshot = await getDocs(q);
        
        console.log(`📊 Found ${snapshot.size} pending payments.`);

        const payments = snapshot.docs.map(doc => {
            const d = doc.data();
            console.log(`   -> Found Log: ${d.transactionCode} - KES ${d.amount}`);
            return { id: doc.id, ...d };
        });

        setPendingPayments(payments);
    } catch (e) {
        console.error("🔥 Error checking pending payments:", e);
    }
  }

  // --- 3. HANDLE PAYMENT SELECTION & DISMISSAL ---
  function selectPayment(payment) {
      console.log(`👆 User selected payment: ${payment.transactionCode}`);
      setTransactionCode(payment.transactionCode);
      if (payment.type === 'mpesa') setPaymentMethod('mpesa');
      else setPaymentMethod('bank');

      if (saleType === "job") {
          setPaid(String(payment.amount));
      }

      setSelectedPaymentId(payment.id);
      setIsAutoFilled(true);
  }

  const dismissPayment = async (paymentId) => {
    console.log(`🗑️ Dismissing payment ID: ${paymentId}`);
    Alert.alert(
        "Dismiss Payment?",
        "Only do this if you have ALREADY recorded this sale.",
        [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Dismiss", 
                style: "destructive",
                onPress: async () => {
                    try {
                        const logRef = doc(db, "mpesa_logs", paymentId);
                        await updateDoc(logRef, { status: "dismissed" });
                        setPendingPayments(prev => prev.filter(p => p.id !== paymentId));
                        console.log("✅ Payment dismissed successfully.");
                    } catch (error) {
                        console.error("❌ Error dismissing:", error);
                        alert("Error dismissing: " + error.message);
                    }
                }
            }
        ]
    );
  };

  // --- 4. SMS LISTENER (FOREGROUND) ---
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const requestPermissions = async () => {
      try { 
          console.log("🛡️ Requesting SMS Permissions...");
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
      } catch (e) { console.error("Permission Error:", e); }
    };
    requestPermissions();

    const subscription = SmsListener.addListener((message) => {
      const sender = message.originatingAddress.toUpperCase();
      const body = message.body;
      
      console.log(`📩 Foreground SMS Received from ${sender}: ${body.substring(0, 20)}...`);

      // 1. Send to Logic
      processIncomingSMS(body, sender, user); 

      // 2. Parse for UI
      const data = parseMpesaSMS(body) || parseBankSMS(body, sender) || parseGenericPayment(body);

      if (data) {
        if (processedCodes.current.has(data.transactionCode)) {
            console.log(`⚠️ Duplicate SMS detected in foreground: ${data.transactionCode}`);
            return;
        }
        processedCodes.current.add(data.transactionCode);

        // If app is active, show alert
        if (!appState.current.match(/inactive|background/)) {
            console.log("🔔 App is Active: Auto-filling UI.");
            if (data.type === "mpesa") setPaymentMethod("mpesa");
            else setPaymentMethod("bank");
            setTransactionCode(data.transactionCode);
            setIsAutoFilled(true); 
            if (saleType === "job") setPaid(String(data.amount));
            Alert.alert("Payment Received", `Code: ${data.transactionCode}\nAmount: ${data.amount}`);
            
            // Refresh list
            setTimeout(() => {
                console.log("🔄 Refreshing list after 1s...");
                checkForPendingPayments();
            }, 1000);
        } else {
            console.log("💤 App is Inactive: Only refreshing list.");
            checkForPendingPayments();
        }
      } else {
          console.log("⚠️ SMS received but parser returned null.");
      }
    });

    return () => subscription.remove();
  }, [saleType, user]);

  // --- HELPERS & SAVE LOGIC ---
  function calculateRetailTotal() {
    return items.reduce((sum, i) => sum + Number(i.qty || 0) * Number(i.price || 0), 0);
  }

  /*async function handleSave() {
    console.log("💾 Starting Save Process...");
    const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
    const amountPaidInput = Number(paid || 0);
    const amountPaid = saleType === "retail" 
        ? (retailCredit ? amountPaidInput : total) 
        : amountPaidInput;

    if (saleType === "job" && (!jobName || !jobTotal)) {
      alert("Please enter a Job Name and Total Amount."); return;
    }
    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && !transactionCode) {
      alert(`Please enter the ${paymentMethod.toUpperCase()} code.`); return;
    }

    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && transactionCode) {
        const matchingLog = pendingPayments.find(p => p.transactionCode === transactionCode);
        if (matchingLog && amountPaid !== matchingLog.amount) {
            console.warn(`⚠️ Amount Mismatch: Input ${amountPaid} vs Log ${matchingLog.amount}`);
            Alert.alert("❌ Mismatch Detected", `Entry: KES ${amountPaid}\nSMS: KES ${matchingLog.amount}\n\nPlease check amounts.`);
            return;
        }
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const balanceAfter = total - amountPaid;
      const accountDescription = saleType === "job" ? jobName : (retailCredit ? `Credit: ${customerName}` : "Retail Sale");
      const bizName = user.businessName || "My Shop"; 

      const receiptText = formatReceipt({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid || total, paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : [] 
      });

      const commonData = {
        amount: amountPaid, 
        paymentMethod,
        transactionCode: paymentMethod === 'cash' ? 'CASH' : (transactionCode || "").toUpperCase(),
        isVerified: paymentMethod === 'cash',
        receiptText,
        items: saleType === 'retail' ? items : [], 
        saleType,
        jobName: saleType === 'job' ? jobName : null
      };

      if (saleType === "retail" && !retailCredit) {
        await createPayment({ ...commonData, amount: total }, user);
      } else {
        const accountId = await createAccount({
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
            items: saleType === 'retail' ? items : [], 
          }, user
        );
        if (amountPaid > 0) {
          await createPayment({ ...commonData, accountId, balanceAfter }, user);
        }
      }

      console.log("✅ Payment Saved to Firestore.");

      // Update Log Status
      if (transactionCode && transactionCode !== "CASH") {
          try {
             const cleanCode = transactionCode.toUpperCase().trim();
             const q = query(
                 collection(db, "mpesa_logs"), 
                 where("transactionCode", "==", cleanCode),
                 where("businessId", "==", user.businessId)
             );
             const snapshot = await getDocs(q);
             if (!snapshot.empty) {
                 snapshot.forEach(async (docSnap) => {
                     await updateDoc(docSnap.ref, { status: "matched" });
                 });
                 console.log("🤝 Matched Log Status Updated.");
             } else {
                 const logRef = doc(db, "mpesa_logs", cleanCode);
                 await updateDoc(logRef, { status: "matched" });
                 console.log("🤝 Log ID matched directly.");
             }
          } catch(e) { console.error("❌ Log update error", e); }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : []
      });

      setIsLoading(false);
      setModalVisible(true);

    } catch (error) {
      console.error("🔥 Critical Save Failure:", error);
      setIsLoading(false);
      alert("Error saving: " + error.message);
    }
  }*/

    async function handleSave() {
    console.log("💾 Starting Save Process...");
    const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
    const amountPaidInput = Number(paid || 0);
    const amountPaid = saleType === "retail" 
        ? (retailCredit ? amountPaidInput : total) 
        : amountPaidInput;

    // --- VALIDATION ---
    if (saleType === "job" && (!jobName || !jobTotal)) {
      alert("Please enter a Job Name and Total Amount."); return;
    }
    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && !transactionCode) {
      alert(`Please enter the ${paymentMethod.toUpperCase()} code.`); return;
    }

    // --- THEFT CHECK ---
    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && transactionCode) {
        const matchingLog = pendingPayments.find(p => p.transactionCode === transactionCode);
        if (matchingLog && amountPaid !== matchingLog.amount) {
            console.warn(`⚠️ Amount Mismatch: Input ${amountPaid} vs Log ${matchingLog.amount}`);
            Alert.alert("❌ Mismatch Detected", `Entry: KES ${amountPaid}\nSMS: KES ${matchingLog.amount}\n\nPlease check amounts.`);
            return;
        }
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const balanceAfter = total - amountPaid;
      const accountDescription = saleType === "job" ? jobName : (retailCredit ? `Credit: ${customerName}` : "Retail Sale");
      const bizName = user.businessName || "My Shop"; 

      // 1. Generate Receipt Data
      const receiptText = formatReceipt({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid || total, paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : [] 
      });

      const commonData = {
        amount: amountPaid, 
        paymentMethod,
        transactionCode: paymentMethod === 'cash' ? 'CASH' : (transactionCode || "").toUpperCase(),
        isVerified: paymentMethod === 'cash',
        receiptText,
        items: saleType === 'retail' ? items : [], 
        saleType,
        jobName: saleType === 'job' ? jobName : null
      };

      // 2. Save Payment to Firestore (Sales/Accounts)
      if (saleType === "retail" && !retailCredit) {
        await createPayment({ ...commonData, amount: total }, user);
      } else {
        const accountId = await createAccount({
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
            items: saleType === 'retail' ? items : [], 
          }, user
        );
        if (amountPaid > 0) {
          await createPayment({ ...commonData, accountId, balanceAfter }, user);
        }
      }

      console.log("✅ Payment Saved to Firestore.");

      // 3. UPDATE LOG STATUS & REMOVE FROM UI (The Important Part)
      if (transactionCode && transactionCode !== "CASH") {
          const cleanCode = transactionCode.toUpperCase().trim();

          // ---------------------------------------------------------
          // 👇 THIS WAS MISSING! THIS REMOVES IT FROM THE SCREEN 👇
          // ---------------------------------------------------------
          setPendingPayments(currentList => 
              currentList.filter(p => p.transactionCode !== cleanCode)
          );
          // ---------------------------------------------------------

          try {
             // Mark as matched in Database
             const logRef = doc(db, "mpesa_logs", cleanCode);
             await updateDoc(logRef, { status: "matched" });
             console.log("🤝 Matched Log Status Updated in DB.");
          } catch(e) { 
             // Fallback query if direct ID match fails
             console.error("❌ Direct update failed, trying query match...", e);
             const q = query(collection(db, "mpesa_logs"), where("transactionCode", "==", cleanCode), where("businessId", "==", user.businessId));
             const snap = await getDocs(q);
             snap.forEach(d => updateDoc(d.ref, { status: "matched" }));
          }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : []
      });

      setIsLoading(false);
      setModalVisible(true);

    } catch (error) {
      console.error("🔥 Critical Save Failure:", error);
      setIsLoading(false);
      alert("Error saving: " + error.message);
    }
  }

  // --- PDF & SHARING ---
  const handleSharePDF = async () => {
    if (!receiptData) return;
    try {
        const htmlContent = `
        <html>
            <head>
                <style>
                    body { font-family: 'Helvetica', sans-serif; padding: 20px; text-align: center; }
                    .header { margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 24px; color: #333; }
                    .header p { margin: 5px 0; color: #666; font-size: 12px; }
                    .divider { border-bottom: 2px dashed #ccc; margin: 15px 0; }
                    .items-table { width: 100%; text-align: left; margin-bottom: 15px; font-size: 14px; }
                    .items-table th { border-bottom: 1px solid #ddd; padding: 5px 0; }
                    .items-table td { padding: 5px 0; border-bottom: 1px solid #eee; }
                    .total-section { text-align: right; font-size: 16px; font-weight: bold; margin-top: 10px; }
                    .payment-info { background: #f0f0f0; padding: 10px; border-radius: 5px; margin-top: 20px; font-size: 12px; }
                    .footer { margin-top: 30px; font-size: 10px; color: #999; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${receiptData.businessName}</h1>
                    <p>Receipt Date: ${new Date().toLocaleString()}</p>
                    <p>Type: ${receiptData.account.description}</p>
                </div>
                <div class="divider"></div>
                <table class="items-table">
                    <thead><tr><th>Item</th><th style="text-align: right;">Qty</th><th style="text-align: right;">Total</th></tr></thead>
                    <tbody>
                        ${receiptData.items && receiptData.items.length > 0 
                            ? receiptData.items.map(item => `<tr><td>${item.name}</td><td style="text-align: right;">${item.qty}</td><td style="text-align: right;">${(item.price * item.qty).toLocaleString()}</td></tr>`).join('') 
                            : `<tr><td colspan="3">Job/Service Charge</td></tr>`
                        }
                    </tbody>
                </table>
                <div class="total-section">Total Paid: KES ${receiptData.payment.amount.toLocaleString()}</div>
                ${receiptData.balanceAfter > 0 ? `<div style="text-align: right; color: red; margin-top: 5px;">Balance Due: KES ${receiptData.balanceAfter.toLocaleString()}</div>` : ''}
                <div class="payment-info"><strong>Payment Details</strong><br/>Method: ${receiptData.payment.paymentMethod.toUpperCase()}<br/>Ref: ${transactionCode || "CASH"}</div>
                <div class="footer">Thank you for your business!</div>
            </body>
        </html>
        `;
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) { Alert.alert("Error", "Could not generate PDF: " + error.message); }
  };

  const handleWhatsApp = async () => { if (receiptData) Linking.openURL(`whatsapp://send?text=${encodeURIComponent(formatReceipt(receiptData))}`); };
  const handleThermalPrint = () => { if (receiptData) printViaRawBT(formatReceipt(receiptData)); };

  function resetForm() {
    setItems([]); setCustomerName(""); setJobName(""); setJobTotal(""); setPaid("");
    setTransactionCode(""); setIsAutoFilled(false); setRetailCredit(false);
    setPaymentMethod("cash"); setModalVisible(false); setSelectedPaymentId(null);
    checkForPendingPayments(); 
  }

  return (
     <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}>
      <View style={{ flex: 1, backgroundColor: "#f6f7f9" }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          
            {/* --- PENDING PAYMENTS LIST (ADDED BACK) --- */}
            {pendingPayments.length > 0 && (
                <View style={styles.paymentListContainer}>
                    <Text style={styles.sectionHeader}>🔔 Recent Payments (Today)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 5}}>
                        {pendingPayments.map((p) => (
                            <View key={p.id} style={{position: 'relative'}}>
                                <TouchableOpacity 
                                    style={[styles.paymentCard, selectedPaymentId === p.id && styles.activePaymentCard]}
                                    onPress={() => selectPayment(p)}
                                >
                                    <View style={styles.paymentHeader}>
                                        <Text style={styles.paymentCode}>{p.transactionCode}</Text>
                                        <Text style={styles.paymentTime}>
                                            {p.receivedAt ? new Date(p.receivedAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                        </Text>
                                    </View>
                                    <Text style={styles.paymentAmount}>KES {p.amount}</Text>
                                    <Text style={styles.paymentSender} numberOfLines={1} ellipsizeMode="tail">{p.sender || "Unknown"}</Text>
                                    {selectedPaymentId === p.id && (<View style={styles.selectedBadge}><Text style={styles.selectedText}>SELECTED</Text></View>)}
                                </TouchableOpacity>
                                
                                <TouchableOpacity style={styles.dismissButton} onPress={() => dismissPayment(p.id)}>
                                    <Text style={styles.dismissText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* FORM */}
            <Card><SaleTypeToggle value={saleType} onChange={setSaleType} /></Card>
            <Card>
            {saleType === "retail" ? (
                <View>
                <RetailItems items={items} setItems={setItems} />
                <TouchableOpacity onPress={() => setRetailCredit(!retailCredit)} style={styles.creditToggleButton}>
                    <Text style={[styles.creditToggleText, retailCredit && { color: '#d32f2f' }]}>{retailCredit ? "⚠️ CREDIT SALE ACTIVE" : "💳 Convert to Credit Sale?"}</Text>
                </TouchableOpacity>
                {retailCredit && (
                    <View style={styles.creditSection}>
                    <Text style={styles.inputLabel}>Customer Name</Text>
                    <TextInput placeholder="Enter name..." value={customerName} onChangeText={setCustomerName} style={styles.amountPaidInput} />
                    <Text style={[styles.inputLabel, { marginTop: 15 }]}>Deposit Paid Now</Text>
                    <TextInput placeholder="0.00" keyboardType="numeric" value={paid} onChangeText={setPaid} style={styles.amountPaidInput} />
                    </View>
                )}
                </View>
            ) : (
                <JobSale jobName={jobName} setJobName={setJobName} jobTotal={jobTotal} setJobTotal={setJobTotal} paid={paid} setPaid={setPaid} />
            )}
            </Card>
            <Card>
                <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
                {(paymentMethod === "mpesa" || paymentMethod === "bank") && (
                    <TextInput placeholder={`Enter ${paymentMethod.toUpperCase()} Ref Code`} value={transactionCode} onChangeText={setTransactionCode} style={[styles.amountPaidInput, isAutoFilled && styles.autoFilledInput]} autoCapitalize="characters" />
                )}
            </Card>

            {BackgroundService.isRunning() && <Text style={styles.serviceStatus}>⚡ Background Listener Active</Text>}
            <PrimaryButton title="Save & Process Sale" onPress={handleSave} />
        </ScrollView>

        {/* LOADING */}
        <Modal transparent={true} visible={isLoading} animationType="fade">
            <View style={styles.loadingOverlay}>
                <View style={styles.loadingBox}>
                <Image source={logo} style={styles.loadingLogo} />
                <ActivityIndicator size="large" color="#1565c0" />
                <Text style={styles.loadingText}>Processing...</Text>
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
                    <ReceiptCard businessName={receiptData.businessName} account={receiptData.account} payment={receiptData.payment} balanceAfter={receiptData.balanceAfter} items={receiptData.items} />
                )}
                <TouchableOpacity style={styles.doneButton} onPress={() => { resetForm(); navigation.navigate("Summary"); }}>
                    <Text style={styles.doneButtonText}>Finish & New Sale</Text>
                </TouchableOpacity>
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.printButton} onPress={handleSharePDF}>
                         <Text style={[styles.printButtonText, { color: '#d32f2f' }]}>📤 Share PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.printButton} onPress={handleWhatsApp}>
                        <Text style={[styles.printButtonText, { color: '#25D366' }]}>WhatsApp Text</Text>
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
  creditToggleButton: { marginTop: 20, padding: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  creditToggleText: { color: "#1565c0", fontSize: 13, fontWeight: "800", textAlign: 'center' },
  creditSection: { marginTop: 10, backgroundColor: '#fff5f5', padding: 15, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: '#d32f2f' },
  inputLabel: { fontSize: 11, fontWeight: '900', color: '#888', marginBottom: 5, uppercase: true },
  amountPaidInput: { backgroundColor: "#fff", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  autoFilledInput: { borderColor: '#2e7d32', backgroundColor: '#e8f5e9', borderWidth: 2 },
  serviceStatus: { textAlign:'center', color:'#2e7d32', fontSize:10, marginBottom:10, fontWeight:'600' },
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
  loadingOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center" },
  loadingBox: { backgroundColor: "white", padding: 25, borderRadius: 15, alignItems: "center", elevation: 5, minWidth: 180 },
  loadingLogo: { width: 60, height: 60, resizeMode: 'contain', marginBottom: 15 },
  loadingText: { marginTop: 15, fontSize: 18, fontWeight: "bold", color: "#333" },
  paymentListContainer: { marginBottom: 15 },
  sectionHeader: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 8, marginLeft: 4 },
  paymentCard: { backgroundColor: 'white', width: 150, padding: 12, borderRadius: 12, marginRight: 10, borderWidth: 1, borderColor: '#eee', shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2, },
  activePaymentCard: { borderColor: '#2e7d32', backgroundColor: '#e8f5e9', borderWidth: 2 },
  paymentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  paymentCode: { fontSize: 11, fontWeight: 'bold', color: '#333' },
  paymentTime: { fontSize: 10, color: '#999' },
  paymentAmount: { fontSize: 16, fontWeight: '900', color: '#2e7d32', marginBottom: 2 },
  paymentSender: { fontSize: 11, color: '#555' },
  selectedBadge: { marginTop: 8, backgroundColor: '#2e7d32', paddingVertical: 2, borderRadius: 4, alignItems: 'center' },
  selectedText: { color:'white', fontSize:10, fontWeight:'bold' },
  dismissButton: { position: 'absolute', right: 0, top: -10, backgroundColor: '#d32f2f', borderRadius: 15, width: 24, height: 24, justifyContent: 'center', alignItems: 'center', zIndex: 10, elevation: 5 },
  dismissText: { color: 'white', fontWeight: 'bold', fontSize: 12 }
});
















/*import { 
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  Share, Linking, Alert, Platform, PermissionsAndroid, KeyboardAvoidingView, 
  ActivityIndicator, Image, Keyboard, AppState 
} from "react-native";
import { useState, useEffect, useRef } from "react"; 
import SmsListener from 'react-native-android-sms-listener'; 
import BackgroundService from 'react-native-background-actions'; 
// PDF Libraries
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Firebase Imports
import { 
  collection, query, where, getDocs, orderBy, limit, doc, updateDoc 
} from "firebase/firestore"; 
import { db } from "../services/firebase"; 

import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS, parseBankSMS, parseGenericPayment } from '../utils/mpesaParser';
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
import logo from "../assets/dukalogo.png";

// --- BACKGROUND SERVICE CONFIGURATION ---
const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

const veryIntensiveTask = async (taskDataArguments) => {
    const { delay } = taskDataArguments;
    await new Promise(async (resolve) => {
        for (let i = 0; BackgroundService.isRunning(); i++) {
            await sleep(delay); 
        }
    });
};

const options = {
    taskName: 'SMSListener',
    taskTitle: 'Shop Listener Active',
    taskDesc: 'Listening for M-Pesa payments...',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#1565c0',
    parameters: {
        delay: 5000, 
    },
};

export default function AddSaleScreen({ navigation, route }) {
  const { user } = route.params;

  // --- REFS ---
  const processedCodes = useRef(new Set());
  const appState = useRef(AppState.currentState);

  // --- STATES ---
  const [saleType, setSaleType] = useState("retail");
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState(""); 
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

  // --- PENDING PAYMENTS LIST STATE ---
  const [pendingPayments, setPendingPayments] = useState([]); 
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);

  // --- 1. START BACKGROUND SERVICE ---
  useEffect(() => {
    const startService = async () => {
      if (!BackgroundService.isRunning()) {
        try {
            await BackgroundService.start(veryIntensiveTask, options);
        } catch (e) { console.log(e); }
      }
    };
    startService();
  }, []);

  // --- 2. CHECK FOR PENDING PAYMENTS ---
  useEffect(() => {
    checkForPendingPayments();
    
    const subscription = AppState.addEventListener("change", nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        checkForPendingPayments();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  async function checkForPendingPayments() {
    if (!user || !user.businessId) return;
    
    try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const q = query(
            collection(db, "mpesa_logs"),
            where("businessId", "==", user.businessId),
            where("status", "==", "unmatched"),
            where("createdAt", ">=", startOfToday),
            orderBy("createdAt", "desc"),
            limit(10) 
        );

        const snapshot = await getDocs(q);
        const payments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        setPendingPayments(payments);
    } catch (e) {
        console.log("Error checking pending payments:", e);
    }
  }

  // --- 3. HANDLE PAYMENT SELECTION & DISMISSAL ---
  function selectPayment(payment) {
      setTransactionCode(payment.transactionCode);
      if (payment.type === 'mpesa') setPaymentMethod('mpesa');
      else setPaymentMethod('bank');

      if (saleType === "job") {
          setPaid(String(payment.amount));
      }

      setSelectedPaymentId(payment.id);
      setIsAutoFilled(true);
  }

  const dismissPayment = async (paymentId) => {
    Alert.alert(
        "Dismiss Payment?",
        "Only do this if you have ALREADY recorded this sale.",
        [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Dismiss", 
                style: "destructive",
                onPress: async () => {
                    try {
                        const logRef = doc(db, "mpesa_logs", paymentId);
                        await updateDoc(logRef, { status: "dismissed" });
                        setPendingPayments(prev => prev.filter(p => p.id !== paymentId));
                    } catch (error) {
                        alert("Error dismissing: " + error.message);
                    }
                }
            }
        ]
    );
  };

  // --- 4. SMS LISTENER (FOREGROUND) ---
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const requestPermissions = async () => {
      try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS); } catch (e) {}
    };
    requestPermissions();

    const subscription = SmsListener.addListener((message) => {
      const sender = message.originatingAddress.toUpperCase();
      const body = message.body;
      
      processIncomingSMS(body, sender, user); 

      const data = parseMpesaSMS(body) || parseBankSMS(body, sender) || parseGenericPayment(body);

      if (data) {
        if (processedCodes.current.has(data.transactionCode)) return;
        processedCodes.current.add(data.transactionCode);

        if (!appState.current.match(/inactive|background/)) {
            if (data.type === "mpesa") setPaymentMethod("mpesa");
            else setPaymentMethod("bank");
            setTransactionCode(data.transactionCode);
            setIsAutoFilled(true); 
            if (saleType === "job") setPaid(String(data.amount));
            Alert.alert("Payment Received", `Code: ${data.transactionCode}\nAmount: ${data.amount}`);
        } else {
            checkForPendingPayments();
        }
      }
    });

    return () => subscription.remove();
  }, [saleType, user]);

  // --- HELPERS & SAVE LOGIC ---
  function calculateRetailTotal() {
    return items.reduce((sum, i) => sum + Number(i.qty || 0) * Number(i.price || 0), 0);
  }

  async function handleSave() {
    const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
    const amountPaidInput = Number(paid || 0);
    const amountPaid = saleType === "retail" 
        ? (retailCredit ? amountPaidInput : total) 
        : amountPaidInput;

    if (saleType === "job" && (!jobName || !jobTotal)) {
      alert("Please enter a Job Name and Total Amount."); return;
    }
    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && !transactionCode) {
      alert(`Please enter the ${paymentMethod.toUpperCase()} code.`); return;
    }

    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && transactionCode) {
        const matchingLog = pendingPayments.find(p => p.transactionCode === transactionCode);
        if (matchingLog && amountPaid !== matchingLog.amount) {
            Alert.alert("❌ Mismatch Detected", `Entry: KES ${amountPaid}\nSMS: KES ${matchingLog.amount}\n\nPlease check amounts.`);
            return;
        }
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const balanceAfter = total - amountPaid;
      const accountDescription = saleType === "job" ? jobName : (retailCredit ? `Credit: ${customerName}` : "Retail Sale");
      const bizName = user.businessName || "My Shop"; 

      const receiptText = formatReceipt({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid || total, paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : [] 
      });

      const commonData = {
        amount: amountPaid, 
        paymentMethod,
        transactionCode: paymentMethod === 'cash' ? 'CASH' : (transactionCode || "").toUpperCase(),
        isVerified: paymentMethod === 'cash',
        receiptText,
        items: saleType === 'retail' ? items : [], 
        saleType,
        jobName: saleType === 'job' ? jobName : null
      };

      if (saleType === "retail" && !retailCredit) {
        await createPayment({ ...commonData, amount: total }, user);
      } else {
        const accountId = await createAccount({
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
            items: saleType === 'retail' ? items : [], 
          }, user
        );
        if (amountPaid > 0) {
          await createPayment({ ...commonData, accountId, balanceAfter }, user);
        }
      }

      if (transactionCode && transactionCode !== "CASH") {
          try {
             const cleanCode = transactionCode.toUpperCase().trim();
             const q = query(
                 collection(db, "mpesa_logs"), 
                 where("transactionCode", "==", cleanCode),
                 where("businessId", "==", user.businessId)
             );
             const snapshot = await getDocs(q);
             if (!snapshot.empty) {
                 snapshot.forEach(async (docSnap) => {
                     await updateDoc(docSnap.ref, { status: "matched" });
                 });
             } else {
                 const logRef = doc(db, "mpesa_logs", cleanCode);
                 await updateDoc(logRef, { status: "matched" });
             }
          } catch(e) { console.log("Log update error", e); }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : []
      });

      setIsLoading(false);
      setModalVisible(true);

    } catch (error) {
      console.error("Save failed:", error);
      setIsLoading(false);
      alert("Error saving: " + error.message);
    }
  }

  // --- PDF GENERATION & SHARING ---
  const handleSharePDF = async () => {
    if (!receiptData) return;

    try {
        // Create HTML for the receipt
        const htmlContent = `
        <html>
            <head>
                <style>
                    body { font-family: 'Helvetica', sans-serif; padding: 20px; text-align: center; }
                    .header { margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 24px; color: #333; }
                    .header p { margin: 5px 0; color: #666; font-size: 12px; }
                    .divider { border-bottom: 2px dashed #ccc; margin: 15px 0; }
                    .items-table { width: 100%; text-align: left; margin-bottom: 15px; font-size: 14px; }
                    .items-table th { border-bottom: 1px solid #ddd; padding: 5px 0; }
                    .items-table td { padding: 5px 0; border-bottom: 1px solid #eee; }
                    .total-section { text-align: right; font-size: 16px; font-weight: bold; margin-top: 10px; }
                    .payment-info { background: #f0f0f0; padding: 10px; border-radius: 5px; margin-top: 20px; font-size: 12px; }
                    .footer { margin-top: 30px; font-size: 10px; color: #999; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${receiptData.businessName}</h1>
                    <p>Receipt Date: ${new Date().toLocaleString()}</p>
                    <p>Type: ${receiptData.account.description}</p>
                </div>
                
                <div class="divider"></div>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th style="text-align: right;">Qty</th>
                            <th style="text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${receiptData.items && receiptData.items.length > 0 
                            ? receiptData.items.map(item => `
                                <tr>
                                    <td>${item.name}</td>
                                    <td style="text-align: right;">${item.qty}</td>
                                    <td style="text-align: right;">${(item.price * item.qty).toLocaleString()}</td>
                                </tr>
                            `).join('') 
                            : `<tr><td colspan="3">Job/Service Charge</td></tr>`
                        }
                    </tbody>
                </table>

                <div class="total-section">
                    Total Paid: KES ${receiptData.payment.amount.toLocaleString()}
                </div>
                
                ${receiptData.balanceAfter > 0 
                    ? `<div style="text-align: right; color: red; margin-top: 5px;">Balance Due: KES ${receiptData.balanceAfter.toLocaleString()}</div>` 
                    : ''
                }

                <div class="payment-info">
                    <strong>Payment Details</strong><br/>
                    Method: ${receiptData.payment.paymentMethod.toUpperCase()}<br/>
                    Ref: ${transactionCode || "CASH"}
                </div>

                <div class="footer">
                    Thank you for your business!
                </div>
            </body>
        </html>
        `;

        // Generate PDF
        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        
        // Share PDF
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });

    } catch (error) {
        Alert.alert("Error", "Could not generate PDF: " + error.message);
    }
  };

  const handleWhatsApp = async () => { if (receiptData) Linking.openURL(`whatsapp://send?text=${encodeURIComponent(formatReceipt(receiptData))}`); };
  const handleThermalPrint = () => { if (receiptData) printViaRawBT(formatReceipt(receiptData)); };

  function resetForm() {
    setItems([]); setCustomerName(""); setJobName(""); setJobTotal(""); setPaid("");
    setTransactionCode(""); setIsAutoFilled(false); setRetailCredit(false);
    setPaymentMethod("cash"); setModalVisible(false); setSelectedPaymentId(null);
    checkForPendingPayments(); 
  }

  return (
     <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}>
      <View style={{ flex: 1, backgroundColor: "#f6f7f9" }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          
            {/* PENDING LIST *//*
            {pendingPayments.length > 0 && (
                <View style={styles.paymentListContainer}>
                    <Text style={styles.sectionHeader}>🔔 Recent Payments ({pendingPayments.length})</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 5}}>
                        {pendingPayments.map((p) => (
                            <View key={p.id} style={{position: 'relative'}}>
                                <TouchableOpacity 
                                    style={[styles.paymentCard, selectedPaymentId === p.id && styles.activePaymentCard]}
                                    onPress={() => selectPayment(p)}
                                >
                                    <View style={styles.paymentHeader}>
                                        <Text style={styles.paymentCode}>{p.transactionCode}</Text>
                                        <Text style={styles.paymentTime}>
                                            {p.receivedAt ? new Date(p.receivedAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                        </Text>
                                    </View>
                                    <Text style={styles.paymentAmount}>KES {p.amount}</Text>
                                    <Text style={styles.paymentSender} numberOfLines={1} ellipsizeMode="tail">{p.sender || "Unknown"}</Text>
                                    {selectedPaymentId === p.id && (<View style={styles.selectedBadge}><Text style={styles.selectedText}>SELECTED</Text></View>)}
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.dismissButton} onPress={() => dismissPayment(p.id)}>
                                    <Text style={styles.dismissText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* FORM *//*
            <Card><SaleTypeToggle value={saleType} onChange={setSaleType} /></Card>
            <Card>
            {saleType === "retail" ? (
                <View>
                <RetailItems items={items} setItems={setItems} />
                <TouchableOpacity onPress={() => setRetailCredit(!retailCredit)} style={styles.creditToggleButton}>
                    <Text style={[styles.creditToggleText, retailCredit && { color: '#d32f2f' }]}>{retailCredit ? "⚠️ CREDIT SALE ACTIVE" : "💳 Convert to Credit Sale?"}</Text>
                </TouchableOpacity>
                {retailCredit && (
                    <View style={styles.creditSection}>
                    <Text style={styles.inputLabel}>Customer Name</Text>
                    <TextInput placeholder="Enter name..." value={customerName} onChangeText={setCustomerName} style={styles.amountPaidInput} />
                    <Text style={[styles.inputLabel, { marginTop: 15 }]}>Deposit Paid Now</Text>
                    <TextInput placeholder="0.00" keyboardType="numeric" value={paid} onChangeText={setPaid} style={styles.amountPaidInput} />
                    </View>
                )}
                </View>
            ) : (
                <JobSale jobName={jobName} setJobName={setJobName} jobTotal={jobTotal} setJobTotal={setJobTotal} paid={paid} setPaid={setPaid} />
            )}
            </Card>
            <Card>
                <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
                {(paymentMethod === "mpesa" || paymentMethod === "bank") && (
                    <TextInput placeholder={`Enter ${paymentMethod.toUpperCase()} Ref Code`} value={transactionCode} onChangeText={setTransactionCode} style={[styles.amountPaidInput, isAutoFilled && styles.autoFilledInput]} autoCapitalize="characters" />
                )}
            </Card>

            {BackgroundService.isRunning() && <Text style={styles.serviceStatus}>⚡ Background Listener Active</Text>}
            <PrimaryButton title="Save & Process Sale" onPress={handleSave} />
        </ScrollView>

        {/* LOADING *//*
        <Modal transparent={true} visible={isLoading} animationType="fade">
            <View style={styles.loadingOverlay}>
                <View style={styles.loadingBox}>
                <Image source={logo} style={styles.loadingLogo} />
                <ActivityIndicator size="large" color="#1565c0" />
                <Text style={styles.loadingText}>Processing...</Text>
                </View>
            </View>
        </Modal>

        {/* SUCCESS MODAL WITH PDF BUTTON *//*
        <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
            <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.successTitle}>✅ Sale Recorded Successfully</Text>
                {receiptData && (
                    <ReceiptCard businessName={receiptData.businessName} account={receiptData.account} payment={receiptData.payment} balanceAfter={receiptData.balanceAfter} items={receiptData.items} />
                )}
                
                <TouchableOpacity style={styles.doneButton} onPress={() => { resetForm(); navigation.navigate("Summary"); }}>
                    <Text style={styles.doneButtonText}>Finish & New Sale</Text>
                </TouchableOpacity>
                
                <View style={styles.actionRow}>
                    {/* BUTTON 1: SHARE PDF *//*
                    <TouchableOpacity style={styles.printButton} onPress={handleSharePDF}>
                         <Text style={[styles.printButtonText, { color: '#d32f2f' }]}>📤 Share PDF</Text>
                    </TouchableOpacity>

                    {/* BUTTON 2: WHATSAPP *//*
                    <TouchableOpacity style={styles.printButton} onPress={handleWhatsApp}>
                        <Text style={[styles.printButtonText, { color: '#25D366' }]}>WhatsApp Text</Text>
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
  creditToggleButton: { marginTop: 20, padding: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  creditToggleText: { color: "#1565c0", fontSize: 13, fontWeight: "800", textAlign: 'center' },
  creditSection: { marginTop: 10, backgroundColor: '#fff5f5', padding: 15, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: '#d32f2f' },
  inputLabel: { fontSize: 11, fontWeight: '900', color: '#888', marginBottom: 5, uppercase: true },
  amountPaidInput: { backgroundColor: "#fff", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  autoFilledInput: { borderColor: '#2e7d32', backgroundColor: '#e8f5e9', borderWidth: 2 },
  serviceStatus: { textAlign:'center', color:'#2e7d32', fontSize:10, marginBottom:10, fontWeight:'600' },
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
  loadingOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center" },
  loadingBox: { backgroundColor: "white", padding: 25, borderRadius: 15, alignItems: "center", elevation: 5, minWidth: 180 },
  loadingLogo: { width: 60, height: 60, resizeMode: 'contain', marginBottom: 15 },
  loadingText: { marginTop: 15, fontSize: 18, fontWeight: "bold", color: "#333" },
  paymentListContainer: { marginBottom: 15 },
  sectionHeader: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 8, marginLeft: 4 },
  paymentCard: { backgroundColor: 'white', width: 150, padding: 12, borderRadius: 12, marginRight: 10, borderWidth: 1, borderColor: '#eee', shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2, },
  activePaymentCard: { borderColor: '#2e7d32', backgroundColor: '#e8f5e9', borderWidth: 2 },
  paymentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  paymentCode: { fontSize: 11, fontWeight: 'bold', color: '#333' },
  paymentTime: { fontSize: 10, color: '#999' },
  paymentAmount: { fontSize: 16, fontWeight: '900', color: '#2e7d32', marginBottom: 2 },
  paymentSender: { fontSize: 11, color: '#555' },
  selectedBadge: { marginTop: 8, backgroundColor: '#2e7d32', paddingVertical: 2, borderRadius: 4, alignItems: 'center' },
  selectedText: { color:'white', fontSize:10, fontWeight:'bold' },
  dismissButton: { position: 'absolute', right: 0, top: -10, backgroundColor: '#d32f2f', borderRadius: 15, width: 24, height: 24, justifyContent: 'center', alignItems: 'center', zIndex: 10, elevation: 5 },
  dismissText: { color: 'white', fontWeight: 'bold', fontSize: 12 }
});*/














/*import { 
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  Share, Linking, Alert, Platform, PermissionsAndroid, KeyboardAvoidingView, 
  ActivityIndicator, Image, Keyboard, AppState 
} from "react-native";
import { useState, useEffect, useRef } from "react"; 
import SmsListener from 'react-native-android-sms-listener'; 
import BackgroundService from 'react-native-background-actions'; 

import { startBackgroundListener } from '../services/backgroundService';

// Firebase Imports
import { 
  collection, query, where, getDocs, orderBy, limit, doc, updateDoc 
} from "firebase/firestore"; 
import { db } from "../services/firebase"; 

import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS, parseBankSMS, parseGenericPayment } from '../utils/mpesaParser';
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
import logo from "../assets/dukalogo.png";

// --- BACKGROUND SERVICE CONFIGURATION ---
const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

const veryIntensiveTask = async (taskDataArguments) => {
    const { delay } = taskDataArguments;
    await new Promise(async (resolve) => {
        for (let i = 0; BackgroundService.isRunning(); i++) {
            await sleep(delay); 
        }
    });
};

const options = {
    taskName: 'SMSListener',
    taskTitle: 'Shop Listener Active',
    taskDesc: 'Listening for M-Pesa payments...',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#1565c0',
    parameters: {
        delay: 5000, 
    },
};

export default function AddSaleScreen({ navigation, route }) {
  const { user } = route.params;

  // --- REFS ---
  const processedCodes = useRef(new Set());
  const appState = useRef(AppState.currentState);

  // --- STATES ---
  const [saleType, setSaleType] = useState("retail");
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState(""); 
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

  // --- PENDING PAYMENTS LIST STATE ---
  const [pendingPayments, setPendingPayments] = useState([]); 
  const [selectedPaymentId, setSelectedPaymentId] = useState(null);

  // --- 1. START BACKGROUND SERVICE ---
  /*useEffect(() => {
    const startService = async () => {
      if (!BackgroundService.isRunning()) {
        try {
            await BackgroundService.start(veryIntensiveTask, options);
        } catch (e) { console.log(e); }
      }
    };
    startService();
  }, []);*/
/*
    useEffect(() => {
    const initService = async () => {
       // We pass the user object so the background task knows the Business ID
       await startBackgroundListener(user);
    };
    initService();
  }, [user]);

  // --- 2. CHECK FOR PENDING PAYMENTS ---
  useEffect(() => {
    checkForPendingPayments();
    
    const subscription = AppState.addEventListener("change", nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active") {
        checkForPendingPayments();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  
 async function checkForPendingPayments() {
    if (!user || !user.businessId) return;
    
    try {
        // 1. Get "Start of Today" (00:00:00)
        const now = new Date();
        // Create a new date set to midnight of the current day
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const q = query(
            collection(db, "mpesa_logs"),
            where("businessId", "==", user.businessId),
            where("status", "==", "unmatched"),
            where("createdAt", ">=", startOfToday), // <--- FILTER: Only items after midnight today
            orderBy("createdAt", "desc"),
            limit(20) // Increased limit slightly since we are filtering by date
        );

        const snapshot = await getDocs(q);
        const payments = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        setPendingPayments(payments);
    } catch (e) {
        console.log("Error checking pending payments:", e);
    }
  }

  // --- 3. HANDLE PAYMENT SELECTION & DISMISSAL ---
  function selectPayment(payment) {
      setTransactionCode(payment.transactionCode);
      if (payment.type === 'mpesa') setPaymentMethod('mpesa');
      else setPaymentMethod('bank');

      if (saleType === "job") {
          setPaid(String(payment.amount));
      }

      setSelectedPaymentId(payment.id);
      setIsAutoFilled(true);
  }

  // NEW: Manually hide a payment if it was already recorded
  const dismissPayment = async (paymentId) => {
    Alert.alert(
        "Dismiss Payment?",
        "Only do this if you have ALREADY recorded this sale.",
        [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Dismiss", 
                style: "destructive",
                onPress: async () => {
                    // Update DB
                    try {
                        const logRef = doc(db, "mpesa_logs", paymentId);
                        await updateDoc(logRef, { status: "dismissed" });
                        // Remove from local list immediately
                        setPendingPayments(prev => prev.filter(p => p.id !== paymentId));
                    } catch (error) {
                        alert("Error dismissing: " + error.message);
                    }
                }
            }
        ]
    );
  };

  // --- 4. SMS LISTENER (FOREGROUND) ---
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const requestPermissions = async () => {
      try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS); } catch (e) {}
    };
    requestPermissions();

    const subscription = SmsListener.addListener((message) => {
      const sender = message.originatingAddress.toUpperCase();
      const body = message.body;
      
      processIncomingSMS(body, sender, user); 

      const data = parseMpesaSMS(body) || parseBankSMS(body, sender) || parseGenericPayment(body);

      if (data) {
        if (processedCodes.current.has(data.transactionCode)) return;
        processedCodes.current.add(data.transactionCode);

        if (!appState.current.match(/inactive|background/)) {
            if (data.type === "mpesa") setPaymentMethod("mpesa");
            else setPaymentMethod("bank");
            setTransactionCode(data.transactionCode);
            setIsAutoFilled(true); 
            if (saleType === "job") setPaid(String(data.amount));
            Alert.alert("Payment Received", `Code: ${data.transactionCode}\nAmount: ${data.amount}`);
        } else {
            checkForPendingPayments();
        }
      }
    });

    return () => subscription.remove();
  }, [saleType, user]);

  // --- HELPERS & SAVE LOGIC ---
  function calculateRetailTotal() {
    return items.reduce((sum, i) => sum + Number(i.qty || 0) * Number(i.price || 0), 0);
  }

  async function handleSave() {
    const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
    const amountPaidInput = Number(paid || 0);
    const amountPaid = saleType === "retail" 
        ? (retailCredit ? amountPaidInput : total) 
        : amountPaidInput;

    if (saleType === "job" && (!jobName || !jobTotal)) {
      alert("Please enter a Job Name and Total Amount."); return;
    }
    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && !transactionCode) {
      alert(`Please enter the ${paymentMethod.toUpperCase()} code.`); return;
    }

    // MATCH VALIDATION
    if ((paymentMethod === "mpesa" || paymentMethod === "bank") && transactionCode) {
        const matchingLog = pendingPayments.find(p => p.transactionCode === transactionCode);
        if (matchingLog && amountPaid !== matchingLog.amount) {
            Alert.alert("❌ Mismatch Detected", `Entry: KES ${amountPaid}\nSMS: KES ${matchingLog.amount}\n\nPlease check amounts.`);
            return;
        }
    }

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const balanceAfter = total - amountPaid;
      const accountDescription = saleType === "job" ? jobName : (retailCredit ? `Credit: ${customerName}` : "Retail Sale");
      const bizName = user.businessName || "My Shop"; 

      const receiptText = formatReceipt({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid || total, paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : [] 
      });

      const commonData = {
        amount: amountPaid, 
        paymentMethod,
        transactionCode: paymentMethod === 'cash' ? 'CASH' : (transactionCode || "").toUpperCase(),
        isVerified: paymentMethod === 'cash',
        receiptText,
        items: saleType === 'retail' ? items : [], 
        saleType,
        jobName: saleType === 'job' ? jobName : null
      };

      if (saleType === "retail" && !retailCredit) {
        await createPayment({ ...commonData, amount: total }, user);
      } else {
        const accountId = await createAccount({
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
            items: saleType === 'retail' ? items : [], 
          }, user
        );
        if (amountPaid > 0) {
          await createPayment({ ...commonData, accountId, balanceAfter }, user);
        }
      }

      // --- IMPROVED MATCHING LOGIC ---
      // We Query for the code instead of assuming the ID, to catch manual entries too.
      if (transactionCode && transactionCode !== "CASH") {
          try {
             const cleanCode = transactionCode.toUpperCase().trim();
             
             // 1. Try to find the log by querying the field (More Robust)
             const q = query(
                 collection(db, "mpesa_logs"), 
                 where("transactionCode", "==", cleanCode),
                 where("businessId", "==", user.businessId)
             );
             const snapshot = await getDocs(q);
             
             if (!snapshot.empty) {
                 // Update all matches (usually just one)
                 snapshot.forEach(async (docSnap) => {
                     await updateDoc(docSnap.ref, { status: "matched" });
                 });
             } else {
                 // Fallback: Try ID directly
                 const logRef = doc(db, "mpesa_logs", cleanCode);
                 await updateDoc(logRef, { status: "matched" });
             }

          } catch(e) {
              console.log("Could not update log status:", e);
          }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : []
      });

      setIsLoading(false);
      setModalVisible(true);

    } catch (error) {
      console.error("Save failed:", error);
      setIsLoading(false);
      alert("Error saving: " + error.message);
    }
  }

  // --- ACTIONS (Unchanged) ---
  const handleShareReceipt = async () => { if (receiptData) Share.share({ message: formatReceipt(receiptData) }); };
  const handleWhatsApp = async () => { if (receiptData) Linking.openURL(`whatsapp://send?text=${encodeURIComponent(formatReceipt(receiptData))}`); };
  const handleThermalPrint = () => { if (receiptData) printViaRawBT(formatReceipt(receiptData)); };

  function resetForm() {
    setItems([]); setCustomerName(""); setJobName(""); setJobTotal(""); setPaid("");
    setTransactionCode(""); setIsAutoFilled(false); setRetailCredit(false);
    setPaymentMethod("cash"); setModalVisible(false); setSelectedPaymentId(null);
    checkForPendingPayments(); 
  }

  return (
     <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0} 
     >
      <View style={{ flex: 1, backgroundColor: "#f6f7f9" }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          
            {/* --- PENDING PAYMENTS LIST WITH DISMISS --- *//*
            {pendingPayments.length > 0 && (
                <View style={styles.paymentListContainer}>
                    <Text style={styles.sectionHeader}>🔔 Recent Payments ({pendingPayments.length})</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingBottom: 5}}>
                        {pendingPayments.map((p) => (
                            <View key={p.id} style={{position: 'relative'}}>
                                <TouchableOpacity 
                                    style={[
                                        styles.paymentCard, 
                                        selectedPaymentId === p.id && styles.activePaymentCard
                                    ]}
                                    onPress={() => selectPayment(p)}
                                >
                                    <View style={styles.paymentHeader}>
                                        <Text style={styles.paymentCode}>{p.transactionCode}</Text>
                                        <Text style={styles.paymentTime}>
                                            {p.receivedAt ? new Date(p.receivedAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                        </Text>
                                    </View>
                                    <Text style={styles.paymentAmount}>KES {p.amount}</Text>
                                    <Text style={styles.paymentSender} numberOfLines={1} ellipsizeMode="tail">
                                        {p.sender || "Unknown"}
                                    </Text>
                                    
                                    {selectedPaymentId === p.id && (
                                        <View style={styles.selectedBadge}><Text style={styles.selectedText}>SELECTED</Text></View>
                                    )}
                                </TouchableOpacity>

                                {/* DISMISS BUTTON (X) *//*
                                <TouchableOpacity 
                                    style={styles.dismissButton}
                                    onPress={() => dismissPayment(p.id)}
                                >
                                    <Text style={styles.dismissText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* --- REST OF FORM (Unchanged) --- *//*
            <Card><SaleTypeToggle value={saleType} onChange={setSaleType} /></Card>

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
                    <Text style={styles.inputLabel}>Customer Name</Text>
                    <TextInput placeholder="Enter name..." value={customerName} onChangeText={setCustomerName} style={styles.amountPaidInput} />
                    <Text style={[styles.inputLabel, { marginTop: 15 }]}>Deposit Paid Now</Text>
                    <TextInput placeholder="0.00" keyboardType="numeric" value={paid} onChangeText={setPaid} style={styles.amountPaidInput} />
                    </View>
                )}
                </View>
            ) : (
                <JobSale jobName={jobName} setJobName={setJobName} jobTotal={jobTotal} setJobTotal={setJobTotal} paid={paid} setPaid={setPaid} />
            )}
            </Card>

            <Card>
                <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
                {(paymentMethod === "mpesa" || paymentMethod === "bank") && (
                    <TextInput
                        placeholder={`Enter ${paymentMethod.toUpperCase()} Ref Code`}
                        value={transactionCode}
                        onChangeText={setTransactionCode}
                        style={[styles.amountPaidInput, isAutoFilled && styles.autoFilledInput]}
                        autoCapitalize="characters"
                    />
                )}
            </Card>

            {BackgroundService.isRunning() && (
                <Text style={styles.serviceStatus}>⚡ Background Listener Active</Text>
            )}
            <PrimaryButton title="Save & Process Sale" onPress={handleSave} />
        </ScrollView>

        {/* --- MODALS --- *//*
        <Modal transparent={true} visible={isLoading} animationType="fade">
            <View style={styles.loadingOverlay}>
                <View style={styles.loadingBox}>
                <Image source={logo} style={styles.loadingLogo} />
                <ActivityIndicator size="large" color="#1565c0" />
                <Text style={styles.loadingText}>Processing...</Text>
                </View>
            </View>
        </Modal>

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
                    items={receiptData.items} 
                    />
                )}
                <TouchableOpacity style={styles.doneButton} onPress={() => { resetForm(); navigation.navigate("Summary"); }}>
                    <Text style={styles.doneButtonText}>Finish & New Sale</Text>
                </TouchableOpacity>
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.printButton} onPress={handleShareReceipt}><Text style={styles.printButtonText}>Share SMS</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.printButton} onPress={handleWhatsApp}><Text style={[styles.printButtonText, { color: '#25D366' }]}>WhatsApp</Text></TouchableOpacity>
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
  creditToggleButton: { marginTop: 20, padding: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  creditToggleText: { color: "#1565c0", fontSize: 13, fontWeight: "800", textAlign: 'center' },
  creditSection: { marginTop: 10, backgroundColor: '#fff5f5', padding: 15, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: '#d32f2f' },
  inputLabel: { fontSize: 11, fontWeight: '900', color: '#888', marginBottom: 5, uppercase: true },
  amountPaidInput: { backgroundColor: "#fff", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd', color: '#333' },
  autoFilledInput: { borderColor: '#2e7d32', backgroundColor: '#e8f5e9', borderWidth: 2 },
  serviceStatus: { textAlign:'center', color:'#2e7d32', fontSize:10, marginBottom:10, fontWeight:'600' },
  
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
  loadingOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center" },
  loadingBox: { backgroundColor: "white", padding: 25, borderRadius: 15, alignItems: "center", elevation: 5, minWidth: 180 },
  loadingLogo: { width: 60, height: 60, resizeMode: 'contain', marginBottom: 15 },
  loadingText: { marginTop: 15, fontSize: 18, fontWeight: "bold", color: "#333" },

  paymentListContainer: { marginBottom: 15 },
  sectionHeader: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 8, marginLeft: 4 },
  paymentCard: {
      backgroundColor: 'white', width: 150, padding: 12, borderRadius: 12, marginRight: 10,
      borderWidth: 1, borderColor: '#eee',
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  activePaymentCard: { borderColor: '#2e7d32', backgroundColor: '#e8f5e9', borderWidth: 2 },
  paymentHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  paymentCode: { fontSize: 11, fontWeight: 'bold', color: '#333' },
  paymentTime: { fontSize: 10, color: '#999' },
  paymentAmount: { fontSize: 16, fontWeight: '900', color: '#2e7d32', marginBottom: 2 },
  paymentSender: { fontSize: 11, color: '#555' },
  selectedBadge: { marginTop: 8, backgroundColor: '#2e7d32', paddingVertical: 2, borderRadius: 4, alignItems: 'center' },
  selectedText: { color:'white', fontSize:10, fontWeight:'bold' },
  
  // New Dismiss Button Styles
  dismissButton: {
      position: 'absolute',
      right: 0,
      top: -10,
      backgroundColor: '#d32f2f',
      borderRadius: 15,
      width: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
      elevation: 5
  },
  dismissText: {
      color: 'white',
      fontWeight: 'bold',
      fontSize: 12
  }
});*/






















/*import { 
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  Share, Linking, Alert, Platform, PermissionsAndroid, KeyboardAvoidingView, 
  ActivityIndicator, Image, Keyboard, AppState 
} from "react-native";
import { useState, useEffect, useRef } from "react"; 
import SmsListener from 'react-native-android-sms-listener'; 
import BackgroundService from 'react-native-background-actions'; // <--- 1. IMPORT THIS
import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS, parseBankSMS, parseGenericPayment } from '../utils/mpesaParser';
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
import logo from "../assets/dukalogo.png";

// --- 2. DEFINE BACKGROUND TASK OPTIONS ---
const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

// A "dummy" task that runs forever to keep the Javascript engine awake
const veryIntensiveTask = async (taskDataArguments) => {
    const { delay } = taskDataArguments;
    await new Promise(async (resolve) => {
        for (let i = 0; BackgroundService.isRunning(); i++) {
            // Check app status every few seconds
            await sleep(delay); 
        }
    });
};

// Notification details (Must be visible to keep app alive)
const options = {
    taskName: 'SMSListener',
    taskTitle: 'Payment Listener Active',
    taskDesc: 'Listening for M-Pesa...',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#1565c0',
    parameters: {
        delay: 5000, 
    },
};

export default function AddSaleScreen({ navigation, route }) {
  const { user } = route.params;

  // --- REFS ---
  const processedCodes = useRef(new Set());
  const appState = useRef(AppState.currentState);
  const pendingCode = useRef(null); 

  // --- STATES ---
  const [saleType, setSaleType] = useState("retail");
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState(""); 
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

  // --- 3. START BACKGROUND SERVICE ---
  useEffect(() => {
    const startService = async () => {
      // Only start if not already running
      if (!BackgroundService.isRunning()) {
        try {
            await BackgroundService.start(veryIntensiveTask, options);
            console.log("⚡ Background Service Started!");
        } catch (e) {
            console.log("Error starting background service:", e);
        }
      }
    };
    startService();
    // Optional: Stop service when leaving screen? 
    // Usually you want this running always, so we don't stop it here.
  }, []);

  // --- APP STATE LISTENER (Detects Waking Up) ---
  useEffect(() => {
    const subscription = AppState.addEventListener("change", nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        console.log("⚡ App woke up!");
        
        // If we received a code while sleeping, fill it now
        if (pendingCode.current) {
            setTransactionCode(pendingCode.current);
            setIsAutoFilled(true);
            Alert.alert("New Payment", `M-Pesa Code ${pendingCode.current} applied!`);
            pendingCode.current = null; 
        }
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

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
      const sender = message.originatingAddress.toUpperCase();
      const body = message.body;
      let data = null;

      console.log(`SMS Received from: ${sender}`);

      data = parseMpesaSMS(body) || parseBankSMS(body, sender) || parseGenericPayment(body);

      if (data) {
        if (processedCodes.current.has(data.transactionCode)) {
            console.log(`🚫 Blocked duplicate event: ${data.transactionCode}`);
            return; 
        }
        processedCodes.current.add(data.transactionCode);

        // --- BACKGROUND HANDLING ---
        const isBackground = appState.current.match(/inactive|background/);

        // 1. SAVE TO DB (Always run this, even in background)
        if (user && user.businessId) {
            processIncomingSMS(body, sender, user);
        }

        if (isBackground) {
            // 2a. IF BACKGROUND: Don't update UI, just save for later
            console.log("💤 App is in background. Saving code to pending...");
            pendingCode.current = data.transactionCode;
        } else {
            // 2b. IF FOREGROUND: Update UI immediately
            if (data.type === "mpesa") setPaymentMethod("mpesa");
            else setPaymentMethod("bank");

            setTransactionCode(data.transactionCode);
            setIsAutoFilled(true); 
            
            if (saleType === "job") setPaid(String(data.amount));
            
            Alert.alert("Payment Detected", `Code: ${data.transactionCode}\nAmount: ${data.amount}`);
        }
      }
    });

    return () => subscription.remove();
  }, [saleType, user]);

  // --- HELPERS & SAVE LOGIC (UNCHANGED) ---
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

    Keyboard.dismiss();
    setIsLoading(true);

    try {
      const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
      const amountPaidInput = Number(paid || 0);
      const amountPaid = saleType === "retail" 
        ? (retailCredit ? amountPaidInput : total) 
        : amountPaidInput;

      const balanceAfter = total - amountPaid;
      const accountDescription = saleType === "job" 
        ? jobName 
        : (retailCredit ? `Credit: ${customerName}` : "Retail Sale");
      
      const bizName = user.businessName || "My Shop"; 

      const receiptText = formatReceipt({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid || total, paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : [] 
      });

      const commonData = {
        amount: amountPaid, 
        paymentMethod,
        transactionCode: paymentMethod === 'cash' ? 'CASH' : (transactionCode || "").toUpperCase(),
        isVerified: paymentMethod === 'cash',
        receiptText,
        items: saleType === 'retail' ? items : [], 
        saleType,
        jobName: saleType === 'job' ? jobName : null
      };

      if (saleType === "retail" && !retailCredit) {
        await createPayment({ ...commonData, amount: total }, user);
      } else {
        const accountId = await createAccount({
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
            items: saleType === 'retail' ? items : [], 
          }, user
        );

        if (amountPaid > 0) {
          await createPayment({ ...commonData, accountId, balanceAfter }, user);
        }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : []
      });

      setIsLoading(false);
      setModalVisible(true);
    } catch (error) {
      console.error("Save failed:", error);
      setIsLoading(false);
      alert("Error saving: " + error.message);
    }
  }

  // --- ACTIONS (UNCHANGED) ---
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

  return (
     <KeyboardAvoidingView 
    style={{ flex: 1 }}
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0} 
  >
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
                    placeholderTextColor="#999"
                    value={customerName}
                    onChangeText={setCustomerName}
                    style={styles.amountPaidInput}
                  />
                  
                  <Text style={[styles.inputLabel, { marginTop: 15 }]}>Deposit Paid Now (Optional)</Text>
                  <TextInput
                    placeholder="0.00"
                    placeholderTextColor="#999"
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
              placeholderTextColor="#999"
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
              ✅ {paymentMethod === 'bank' ? 'Bank' : 'M-Pesa'} Code Detected: {transactionCode}
            </Text>
          </View>
        )}
        
        {/* Helper text so you know if service is running *//*
        {BackgroundService.isRunning() && (
            <Text style={{textAlign:'center', color:'green', fontSize:10, marginBottom:10}}>
                ⚡ Background Listener Active
            </Text>
        )}

        <PrimaryButton title="Save & Process Sale" onPress={handleSave} />
      </ScrollView>

       {/* LOADING MODAL *//*
      <Modal transparent={true} visible={isLoading} animationType="fade">
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
              <Image source={logo} style={styles.loadingLogo} />
              <ActivityIndicator size="large" color="#1565c0" />
              <Text style={styles.loadingText}>Processing Sale...</Text>
              <Text style={styles.loadingSubText}>Saving items to database...</Text>
            </View>
          </View>
        </Modal>

      {/* SUCCESS MODAL *//*
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
                  items={receiptData.items} 
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
  creditToggleButton: { marginTop: 20, padding: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  creditToggleText: { color: "#1565c0", fontSize: 13, fontWeight: "800", textAlign: 'center' },
  creditSection: { marginTop: 10, backgroundColor: '#fff5f5', padding: 15, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: '#d32f2f' },
  inputLabel: { fontSize: 11, fontWeight: '900', color: '#888', marginBottom: 5, uppercase: true },
  amountPaidInput: { backgroundColor: "#fff", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd', color: '#333' },
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
  loadingOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center" },
  loadingBox: { backgroundColor: "white", padding: 25, borderRadius: 15, alignItems: "center", elevation: 5, minWidth: 180 },
  loadingLogo: { width: 60, height: 60, resizeMode: 'contain', marginBottom: 15 },
  loadingText: { marginTop: 15, fontSize: 18, fontWeight: "bold", color: "#333" },
  loadingSubText: { marginTop: 5, fontSize: 14, color: "#666" }
});*/



















/*import { 
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  Share, Linking, Alert, Platform, PermissionsAndroid, KeyboardAvoidingView, 
  ActivityIndicator, Image, Keyboard 
} from "react-native";
import { useState, useEffect, useRef } from "react"; // Added useRef
import SmsListener from 'react-native-android-sms-listener'; 
import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS, parseBankSMS, parseGenericPayment } from '../utils/mpesaParser';
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
import logo from "../assets/dukalogo.png";

export default function AddSaleScreen({ navigation, route }) {
  const { user } = route.params;

  // --- REFS (From Code 2 - Fixes Duplicates) ---
  const processedCodes = useRef(new Set());

  // --- STATES ---
  const [saleType, setSaleType] = useState("retail");
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState(""); 
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

  // --- SMS LISTENER (From Code 2 - Active & Robust) ---
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const requestPermissions = async () => {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      } catch (err) { console.warn(err); }
    };
    requestPermissions();

    const subscription = SmsListener.addListener((message) => {
      const sender = message.originatingAddress.toUpperCase();
      const body = message.body;
      let data = null;

      console.log(`SMS Received from: ${sender}`);

      // 1. Try Standard M-Pesa
      data = parseMpesaSMS(body);

      // 2. If failed, Try Bank / Sacco
      if (!data) {
        data = parseBankSMS(body, sender);
      }

      // 3. If failed, Try Generic Fallback
      if (!data) {
        data = parseGenericPayment(body);
      }

      if (data) {
        // --- DUPLICATE CHECK (From Code 2) ---
        if (processedCodes.current.has(data.transactionCode)) {
            console.log(`🚫 Blocked duplicate event locally: ${data.transactionCode}`);
            return; 
        }
        processedCodes.current.add(data.transactionCode);
        // -------------------------------------

        // Toggle Method
        if (data.type === "mpesa") setPaymentMethod("mpesa");
        else setPaymentMethod("bank");

        // Auto-fill
        setTransactionCode(data.transactionCode);
        setIsAutoFilled(true); 
        
        if (saleType === "job") setPaid(String(data.amount));

        // Save Log
        if (user && user.businessId) {
            processIncomingSMS(body, sender, user);
        }
        
        Alert.alert("Payment Detected", `Source: ${data.source || sender}\nCode: ${data.transactionCode}\nAmount: ${data.amount}`);
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

  // --- SAVE LOGIC (From Code 1 - Saves Items & Better UX) ---
  async function handleSave() {
    // Validation
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

    // UX: Hide Keyboard
    Keyboard.dismiss();
    setIsLoading(true);

    try {
      // Calculate Totals
      const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
      const amountPaidInput = Number(paid || 0);
      const amountPaid = saleType === "retail" 
        ? (retailCredit ? amountPaidInput : total) 
        : amountPaidInput;

      const balanceAfter = total - amountPaid;
      const accountDescription = saleType === "job" 
        ? jobName 
        : (retailCredit ? `Credit: ${customerName}` : "Retail Sale");
      
      const bizName = user.businessName || "My Shop"; 

      // 1. Prepare Receipt (With Items!)
      const receiptText = formatReceipt({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid || total, paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : [] // ✅ Added Items
      });

      // 2. Prepare DB Data
      const commonData = {
        amount: amountPaid, 
        paymentMethod,
        transactionCode: paymentMethod === 'cash' ? 'CASH' : (transactionCode || "").toUpperCase(),
        isVerified: paymentMethod === 'cash',
        receiptText,
        items: saleType === 'retail' ? items : [], // ✅ Save Items to DB
        saleType,
        jobName: saleType === 'job' ? jobName : null
      };

      // 3. Write to Database
      if (saleType === "retail" && !retailCredit) {
        // Instant Sale
        await createPayment({ ...commonData, amount: total }, user);
      } else {
        // Credit/Job
        const accountId = await createAccount({
            type: saleType,
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
            items: saleType === 'retail' ? items : [], 
          }, user
        );

        if (amountPaid > 0) {
          await createPayment({ ...commonData, accountId, balanceAfter }, user);
        }
      }

      setReceiptData({
        businessName: bizName,
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
        items: saleType === 'retail' ? items : []
      });

      setIsLoading(false);
      setModalVisible(true);
    } catch (error) {
      console.error("Save failed:", error);
      setIsLoading(false);
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

  return (
     <KeyboardAvoidingView 
    style={{ flex: 1 }}
    behavior={Platform.OS === "ios" ? "padding" : "height"}
    keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0} 
  >
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
                    placeholderTextColor="#999"
                    value={customerName}
                    onChangeText={setCustomerName}
                    style={styles.amountPaidInput}
                  />
                  
                  <Text style={[styles.inputLabel, { marginTop: 15 }]}>Deposit Paid Now (Optional)</Text>
                  <TextInput
                    placeholder="0.00"
                    placeholderTextColor="#999"
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
              placeholderTextColor="#999"
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
              ✅ {paymentMethod === 'bank' ? 'Bank' : 'M-Pesa'} Code Detected: {transactionCode}
            </Text>
          </View>
        )}
        
        <PrimaryButton title="Save & Process Sale" onPress={handleSave} />
      </ScrollView>

       {/* LOADING MODAL *//*
      <Modal transparent={true} visible={isLoading} animationType="fade">
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
              <Image source={logo} style={styles.loadingLogo} />
              <ActivityIndicator size="large" color="#1565c0" />
              <Text style={styles.loadingText}>Processing Sale...</Text>
              <Text style={styles.loadingSubText}>Saving items to database...</Text>
            </View>
          </View>
        </Modal>

      {/* SUCCESS MODAL *//*
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
                  items={receiptData.items} 
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
  creditToggleButton: { marginTop: 20, padding: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  creditToggleText: { color: "#1565c0", fontSize: 13, fontWeight: "800", textAlign: 'center' },
  creditSection: { marginTop: 10, backgroundColor: '#fff5f5', padding: 15, borderRadius: 12, borderLeftWidth: 5, borderLeftColor: '#d32f2f' },
  inputLabel: { fontSize: 11, fontWeight: '900', color: '#888', marginBottom: 5, uppercase: true },
  amountPaidInput: { backgroundColor: "#fff", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd', color: '#333' },
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
  loadingOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "center", alignItems: "center" },
  loadingBox: { backgroundColor: "white", padding: 25, borderRadius: 15, alignItems: "center", elevation: 5, minWidth: 180 },
  loadingLogo: { width: 60, height: 60, resizeMode: 'contain', marginBottom: 15 },
  loadingText: { marginTop: 15, fontSize: 18, fontWeight: "bold", color: "#333" },
  loadingSubText: { marginTop: 5, fontSize: 14, color: "#666" }
});*/










/*

import { 
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
  Share, Linking, Alert, Platform, PermissionsAndroid, KeyboardAvoidingView, ActivityIndicator, Image
} from "react-native";
import { useState, useEffect } from "react";
import SmsListener from 'react-native-android-sms-listener'; 
import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS, parseBankSMS, parseGenericPayment } from '../utils/mpesaParser';
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
  /*useEffect(() => {
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
  }, [saleType, user]);*/

  /*useEffect(() => {
    if (Platform.OS !== 'android') return;

    const requestPermissions = async () => {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      } catch (err) { console.warn(err); }
    };
    requestPermissions();

    const subscription = SmsListener.addListener((message) => {
      const sender = message.originatingAddress.toUpperCase(); // e.g. "MPESA" or "EQUITY"
      const body = message.body;

      let data = null;

      // --- CHECK 1: IS IT M-PESA? ---
      if (sender.includes("MPESA") || sender.includes("150")) {
        console.log("Detected M-Pesa SMS");
        data = parseMpesaSMS(body);
      } 
      // --- CHECK 2: IS IT A BANK? ---
      else if (["EQUITY", "KCB", "COOP", "FAMILY", "NCBA", "ABSA", "DTB", "STANBIC"].some(bank => sender.includes(bank))) {
        console.log("Detected Bank SMS");
        data = parseBankSMS(body, sender);
      }

      // --- IF WE FOUND DATA (From either source) ---
      if (data) {
        // 1. Set Payment Method Toggle
        if (data.type === "mpesa") {
          setPaymentMethod("mpesa");
        } else {
          setPaymentMethod("bank");
        }

        // 2. Auto-fill fields
        setTransactionCode(data.transactionCode);
        setIsAutoFilled(true); 
        
        if (saleType === "job") setPaid(String(data.amount));

        // 3. Save to Logs (Theft Detection)
        if (user) processIncomingSMS(body, sender, user);
        
        // 4. Alert User
        Alert.alert(
          "Payment Received", 
          `Via: ${data.source}\nCode: ${data.transactionCode}\nAmount: ${data.amount}`
        );
      }
    });

    return () => subscription.remove();
  }, [saleType, user]);*/

  // --- SMS LISTENER ---
 /* useEffect(() => {
    if (Platform.OS !== 'android') return;

    const requestPermissions = async () => {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      } catch (err) { console.warn(err); }
    };
    requestPermissions();

    const subscription = SmsListener.addListener((message) => {
      const sender = message.originatingAddress.toUpperCase();
      const body = message.body;

      let data = null;

      console.log(`SMS Received from: ${sender}`); // Debugging help

      // --- STRATEGY 1: Is it definitely M-Pesa? ---
      if (sender.includes("MPESA") || sender.includes("150")) {
        data = parseMpesaSMS(body);
      } 
      // --- STRATEGY 2: Try to parse EVERYTHING else as a Bank/Paybill ---
      // We rely on the Regex in parseBankSMS to decide if it's relevant or not.
      // This catches "EQUITY", "KCB", but also generic names like "PAYMENT" or "SMS".
      else {
        data = parseBankSMS(body, sender);
      }

      // --- IF DATA WAS FOUND ---
      if (data) {
        // 1. Toggle the Payment Method
        if (data.type === "mpesa") {
          setPaymentMethod("mpesa");
        } else {
          setPaymentMethod("bank");
        }

        // 2. Auto-fill fields
        setTransactionCode(data.transactionCode);
        setIsAutoFilled(true); 
        
        if (saleType === "job") setPaid(String(data.amount));

        // 3. Save to Logs (Theft Detection)
        // Ensure user object exists to avoid crashes
        if (user && user.businessId) {
            processIncomingSMS(body, sender, user);
        }
        
        // 4. Alert User
        Alert.alert(
          "Payment Detected", 
          `Source: ${data.source}\nCode: ${data.transactionCode}\nAmount: ${data.amount}\nSender: ${data.sender || 'Unknown'}`
        );
      }
    });

    return () => subscription.remove();
  }, [saleType, user]);*/
/*
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const requestPermissions = async () => {
      try {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      } catch (err) { console.warn(err); }
    };
    requestPermissions();

    const subscription = SmsListener.addListener((message) => {
      const sender = message.originatingAddress.toUpperCase();
      const body = message.body;
      let data = null;

      console.log(`SMS Received from: ${sender}`);

      // 1. Try Standard M-Pesa
      data = parseMpesaSMS(body);

      // 2. If failed, Try Bank / Sacco
      if (!data) {
        data = parseBankSMS(body, sender);
      }

      // 3. If failed, Try Generic Fallback (Paybills/Bulk)
      if (!data) {
        data = parseGenericPayment(body);
      }

      if (data) {
        // Toggle Method
        if (data.type === "mpesa") setPaymentMethod("mpesa");
        else setPaymentMethod("bank");

        // Auto-fill
        setTransactionCode(data.transactionCode);
        setIsAutoFilled(true); 
        
        if (saleType === "job") setPaid(String(data.amount));

        // Save Log (Theft Detection)
        if (user && user.businessId) {
            processIncomingSMS(body, sender, user);
        }
        
        Alert.alert("Payment Detected", `Source: ${data.source || sender}\nCode: ${data.transactionCode}\nAmount: ${data.amount}`);
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
                    placeholderTextColor="#333"
                    value={customerName}
                    onChangeText={setCustomerName}
                    style={styles.amountPaidInput}
                  />
                  
                  <Text style={[styles.inputLabel, { marginTop: 15 }]}>Deposit Paid Now (Optional)</Text>
                  <TextInput
                    placeholder="0.00"
                    placeholderTextColor="#333"
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
              placeholderTextColor="#999"
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

       {/* --- LOADING MODAL WITH LOGO --- *//*
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

      {/* SUCCESS MODAL *//*
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
  amountPaidInput: { backgroundColor: "#fff", padding: 14, borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd', color: '#333' },
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
});*/