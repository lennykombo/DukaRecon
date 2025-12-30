import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  StyleSheet, 
  Modal, 
  ScrollView,
  Share, 
  Linking,
  Alert,
  Platform,
  PermissionsAndroid
} from "react-native";
import { useState, useEffect } from "react";
import SmsListener from 'react-native-android-sms-listener'; 
import { processIncomingSMS } from '../services/smsService';
import { parseMpesaSMS } from '../utils/mpesaParser';
//import { printToBluetooth } from "../utils/printer";
import { formatReceipt, printViaRawBT } from "../utils/receipt";
import SaleTypeToggle from "../components/SaleTypeToggle";
import RetailItems from "../components/RetailItems";
import JobSale from "../components/JobSale";
import PaymentToggle from "../components/PaymentToggle";
import PrimaryButton from "../components/PrimaryButton";
import Card from "../components/Card";
import { DEV_USER } from "../utils/devUser";
import { createAccount } from "../services/accounts";
import { createPayment } from "../services/firestore";
//import { formatReceipt } from "../utils/receipt";
import ReceiptCard from "../components/ReceiptCard";



export default function AddSaleScreen({ navigation, route }) {
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


  useEffect(() => {
  if (Platform.OS !== 'android') return;

  // 1. Request Permission (Crucial for Android 10+)
  const requestPermissions = async () => {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        console.log("SMS Permission Granted");
      }
    } catch (err) {
      console.warn(err);
    }
  };

  requestPermissions();

  // 2. Start the Listener
  const subscription = SmsListener.addListener((message) => {
    // message.body contains the SMS text
    // message.originatingAddress contains the sender (e.g., 'MPESA')

    if (message.originatingAddress.toLowerCase().includes("mpesa")) {
      console.log("M-Pesa SMS Caught:", message.body);

      // Sync to cloud for reconciliation dashboard
      processIncomingSMS(message.body, message.originatingAddress);

      // Parse for the attendant UI
      const data = parseMpesaSMS(message.body);
      if (data) {
        setPaymentMethod("mpesa");
        setTransactionCode(data.transactionCode);
        if (saleType === "job") setPaid(String(data.amount));

        Alert.alert("M-Pesa Received", `KES ${data.amount} from ${data.sender}`);
      }
    }
  });

  // 3. Cleanup
  return () => {
    subscription.remove();
  };
}, [saleType]);

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
    setTransactionCode("");
    setRetailCredit(false);
    setPaymentMethod("cash");
    setModalVisible(false);
  }

  /*async function handleSave() {
    if (saleType === "job" && (!jobName || !jobTotal)) {
      alert("Please enter a Job Name and Total Amount.");
      return;
    }

    try {
      const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
      const amountPaid = saleType === "retail" 
        ? (retailCredit ? Number(paid || 0) : total) 
        : Number(paid || 0);

      const accountDescription = saleType === "job" ? jobName : (retailCredit ? "Retail Credit Sale" : "Retail Sale");
      const balanceAfter = total - amountPaid;

      // 1. SAVE TO DATABASE
      if (saleType === "retail" && !retailCredit) {
        const receiptText = formatReceipt({
          businessName: "Your Business Name",
          account: { type: "retail", description: "Retail Sale" },
          payment: { amount: total, paymentMethod },
          balanceAfter: 0,
        });

        await createPayment(
          { accountId: null, amount: total, paymentMethod, receiptText },
          DEV_USER
        );
      } else {
        const accountId = await createAccount(
          {
            type: saleType === "job" ? "job" : "credit_retail",
            description: accountDescription,
            totalAmount: total, 
            paidAmount: amountPaid,
            status: "open",
          },
          DEV_USER
        );

        if (amountPaid > 0) {
          const receiptText = formatReceipt({
            businessName: "Your Business Name",
            account: { type: saleType, description: accountDescription },
            payment: { amount: amountPaid, paymentMethod },
            balanceAfter: balanceAfter,
          });

          await createPayment(
            { accountId, amount: amountPaid, paymentMethod, receiptText },
            DEV_USER
          );
        }
      }

      // 2. SHOW MODAL
      setReceiptData({
        businessName: "Your Business Name",
        account: { type: saleType, description: accountDescription },
        payment: { amount: amountPaid, paymentMethod: paymentMethod },
        balanceAfter: balanceAfter,
      });

      setModalVisible(true);

    } catch (error) {
      console.error("Save failed:", error);
      alert("Error saving: " + error.message);
    }
  }*/

    async function handleSave() {
  // 1. Get the real user from route params (passed from App.js)
  const { user } = route.params;

  // 2. Validation
  if (saleType === "job" && (!jobName || !jobTotal)) {
    alert("Please enter a Job Name and Total Amount.");
    return;
  }

  // Anti-Theft Validation: Ensure M-Pesa/Bank codes are entered
  if ((paymentMethod === "mpesa" || paymentMethod === "bank") && !transactionCode) {
    alert(`Please enter the ${paymentMethod.toUpperCase()} transaction code.`);
    return;
  }

  try {
    const total = saleType === "retail" ? calculateRetailTotal() : Number(jobTotal);
    const amountPaid = saleType === "retail" 
      ? (retailCredit ? Number(paid || 0) : total) 
      : Number(paid || 0);

    const accountDescription = saleType === "job" ? jobName : (retailCredit ? "Retail Credit Sale" : "Retail Sale");
    const balanceAfter = total - amountPaid;

    // Use the Business Name from the logged-in user's profile
    const bizName = user.businessName || "My Shop"; 

    // 3. SAVE TO DATABASE
    
    // CASE A: RETAIL - PAID IN FULL
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
          isVerified: paymentMethod === 'cash' ? true : false, // Cash is verified by default, M-Pesa needs checking
          receiptText 
        },
        user // Using real user instead of DEV_USER
      );
    } 
    
    // CASE B: JOB OR RETAIL CREDIT
    else {
      const accountId = await createAccount(
        {
          type: saleType === "job" ? "job" : "credit_retail",
          description: accountDescription,
          totalAmount: total, 
          paidAmount: amountPaid, // Track initial deposit
          status: "open",
        },
        user // Using real user instead of DEV_USER
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
            isVerified: paymentMethod === 'cash' ? true : false,
            receiptText 
          },
          user
        );
      }
    }

    // 4. PREPARE MODAL DATA
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

  // 1. Generate the text version of the receipt
  const message = formatReceipt({
    businessName: receiptData.businessName,
    account: receiptData.account,
    payment: receiptData.payment,
    balanceAfter: receiptData.balanceAfter,
  });

  try {
    // 2. Open the native share sheet (Works for WhatsApp, SMS, Email, etc.)
    await Share.share({
      message: message,
    });
  } catch (error) {
    alert("Sharing failed: " + error.message);
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
  if (supported) {
    await Linking.openURL(url);
  } else {
    alert("WhatsApp is not installed on this device");
  }
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
  <View style={{ flex: 1, backgroundColor: "#f6f7f9" }}>
    <ScrollView 
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }} // Extra padding at bottom
      keyboardShouldPersistTaps="handled"
    >
      {/* Title */}
      <Text style={{ fontSize: 24, fontWeight: "600", marginBottom: 16 }}>
        New Sale
      </Text>

      {/* Sale Type Card */}
      <Card>
        <SaleTypeToggle value={saleType} onChange={setSaleType} />
      </Card>

      {/* Items or Job Details Card */}
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

      {/* Payment Method Card */}
      <Card>
        <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
        
       {/* Show the Code input for BOTH M-Pesa and Bank */}
{(paymentMethod === "mpesa" || paymentMethod === "bank") && (
  <TextInput
    placeholder={`Enter ${paymentMethod === 'mpesa' ? 'M-Pesa' : 'Bank'} Ref Code`}
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

      {/* Action Button */}
      <PrimaryButton title="Save Sale" onPress={handleSave} />
    </ScrollView>

    {/* Modal remains outside ScrollView so it covers the whole screen */}
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
                <Text style={styles.printButtonText}>Share (SMS/All)</Text>
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
  creditToggleText: {
    color: "#1565c0",
    marginBottom: 10,
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
  },
  amountPaidInput: {
    backgroundColor: "#f9fafb",
    padding: 14,
    borderRadius: 10,
    marginTop: 10,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#f6f7f9",
    borderRadius: 20,
    padding: 15,
    maxHeight: "90%",
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 15,
    color: "#2e7d32",
  },
  doneButton: {
    backgroundColor: "#1565c0",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  doneButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  printButton: {
    padding: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  printButtonText: {
    color: "#1565c0",
    fontSize: 14,
    fontWeight: "600",
  },
});















/*import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { useState } from "react";
import SaleTypeToggle from "../components/SaleTypeToggle";
import RetailItems from "../components/RetailItems";
import JobSale from "../components/JobSale";
import PaymentToggle from "../components/PaymentToggle";
import PrimaryButton from "../components/PrimaryButton";
import Card from "../components/Card";
import { DEV_USER } from "../utils/devUser";
import { createAccount } from "../services/accounts";
import { createPayment } from "../services/firestore";
import { formatReceipt } from "../utils/receipt";



export default function AddSaleScreen({ navigation }) {
  const [saleType, setSaleType] = useState("retail");
  const [items, setItems] = useState([]);
  const [jobName, setJobName] = useState("");
  const [jobTotal, setJobTotal] = useState("");
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [retailCredit, setRetailCredit] = useState(false);



  function calculateRetailTotal() {
    return items.reduce(
      (sum, i) => sum + Number(i.qty || 0) * Number(i.price || 0),
      0
    );
  }


/*async function handleSave() {
    const total =
  saleType === "retail"
    ? calculateRetailTotal()
    : Number(jobTotal);

const amountPaid =
  saleType === "retail"
    ? retailCredit
      ? Number(paid || 0)
      : total
    : Number(paid || 0);

  //const total = calculateRetailTotal() || Number(jobTotal);
  //const amountPaid = Number(paid || 0);

  // CASE 1: PAID IN FULL → NO ACCOUNT
  if (amountPaid >= total) {
    await createPayment(
      {
        accountId: null,
        amount: total,
        paymentMethod,
        createdAt: new Date().toISOString(),
      },
      DEV_USER
    );

    resetForm();
    return;
  }

  // CASE 2: PAY LATER / DEPOSIT → CREATE ACCOUNT
  const accountId = await createAccount(
    {
      type: saleType === "job" ? "job" : "credit_retail",
      description:
        saleType === "job" ? jobName : "Retail Credit Sale",
      totalAmount: total,
    },
    DEV_USER
  );

  // RECORD DEPOSIT / PARTIAL PAYMENT
  if (amountPaid > 0) {
    await createPayment(
      {
        accountId,
        amount: amountPaid,
        paymentMethod,
        createdAt: new Date().toISOString(),
      },
      DEV_USER
    );
  }

  resetForm();
}

function resetForm() {
  setItems([]);
  setJobName("");
  setJobTotal("");
  setPaid("");
}*/

/*function resetForm() {
  setItems([]);
  setJobName("");
  setJobTotal("");
  setPaid("");
  setRetailCredit(false);
  setPaymentMethod("cash");
}

async function handleSave() {
  const total =
    saleType === "retail"
      ? calculateRetailTotal()
      : Number(jobTotal);

  const amountPaid =
    saleType === "retail"
      ? retailCredit
        ? Number(paid || 0)
        : total
      : Number(paid || 0);

  // PAID IN FULL
  if (amountPaid >= total) {
    const receiptText = formatReceipt({
      businessName: "Your Business Name",
      account: {
        type: saleType,
        description:
          saleType === "job" ? jobName : "Retail Sale",
      },
      payment: {
        amount: total,
        paymentMethod,
      },
      balanceAfter: 0,
    });

    await createPayment(
      {
        accountId: null,
        amount: total,
        paymentMethod,
        receiptText,
        createdAt: new Date().toISOString(),
      },
      DEV_USER
    );

    resetForm();
    navigation.navigate("TodaySummary");
    return;
  }

  // JOB / CREDIT ACCOUNT
  const accountId = await createAccount(
    {
      type: saleType === "job" ? "job" : "credit_retail",
      description: jobName,
      totalAmount: total,
      status: "open",
    },
    DEV_USER
  );

  // DEPOSIT
  if (amountPaid > 0) {
    const receiptText = formatReceipt({
      businessName: "Your Business Name",
      account: {
        type: saleType,
        description: jobName,
      },
      payment: {
        amount: amountPaid,
        paymentMethod,
      },
      balanceAfter: total - amountPaid,
    });

    await createPayment(
      {
        accountId,
        amount: amountPaid,
        paymentMethod,
        receiptText,
        createdAt: new Date().toISOString(),
      },
      DEV_USER
    );
  }

  resetForm();
  navigation.navigate("AccountDetail", {
    account: {
      id: accountId,
      type: saleType,
      description: jobName,
      totalAmount: total,
    },
  });
}


  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#f6f7f9" }}>
  <Text style={{ fontSize: 24, fontWeight: "600", marginBottom: 16 }}>
    New Sale
  </Text>

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
  {saleType === "retail" && (
  <>
    <TouchableOpacity onPress={() => setRetailCredit(!retailCredit)}>
      <Text
        style={{
          color: "#1565c0",
          marginBottom: 10,
          marginTop: 10,
          fontSize: 16,
          fontWeight: "600",
        }}
      >
        {retailCredit ? "Retail: Credit Sale" : "Retail: Paid in Full"}
      </Text>
    </TouchableOpacity>

    {retailCredit && (
      <TextInput
        placeholder="Amount Paid"
        keyboardType="numeric"
        value={paid}
        onChangeText={setPaid}
        style={{
          backgroundColor: "#f9fafb",
          padding: 14,
          borderRadius: 10,
          marginTop: 10,
          fontSize: 16,
        }}
      />
    )}
  </>
)}


</Card>


  <PrimaryButton title="Save Sale" onPress={handleSave} />
</View>

  );
}*/
