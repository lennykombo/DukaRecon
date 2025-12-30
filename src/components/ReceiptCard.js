import React from "react";
import { View, Text, StyleSheet } from "react-native";

const ReceiptRow = ({ label, value, bold = false }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, bold && styles.boldValue]}>{value}</Text>
  </View>
);

export default function ReceiptCard({ businessName, account, payment, balanceAfter }) {
  const date = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.container}>
      {/* Top Decoration (Receipt Cut Effect) */}
      <View style={styles.receiptTop} />

      <View style={styles.content}>
        <Text style={styles.businessName}>{businessName}</Text>
        <Text style={styles.receiptType}>Official Receipt</Text>

        <View style={styles.divider} />

        {/* Transaction Details */}
        <ReceiptRow label="Date" value={`${date} ${time}`} />
        <ReceiptRow label="Type" value={account.type === "job" ? "Job Sale" : "Retail Credit"} />
        <ReceiptRow label="Ref" value={account.description} />

        <View style={styles.dashedDivider} />

        {/* Payment Details */}
        <Text style={styles.sectionTitle}>Payment Details</Text>
        <ReceiptRow label="Method" value={payment.paymentMethod.toUpperCase()} />
        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>Paid Amount</Text>
          <Text style={styles.amountValue}>KES {Number(payment.amount).toLocaleString()}</Text>
        </View>

        <View style={styles.dashedDivider} />

        {/* Balance Section */}
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Remaining Balance</Text>
          <Text style={[styles.balanceValue, balanceAfter > 0 ? styles.redBalance : styles.greenBalance]}>
            KES {Number(balanceAfter).toLocaleString()}
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Thank you for your business!</Text>
          <Text style={styles.footerText}>Verified Transaction</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    borderRadius: 12,
    margin: 10,
    // Shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    // Elevation for Android
    elevation: 5,
  },
  receiptTop: {
    height: 8,
    backgroundColor: "#1565c0", // Business Brand Color
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  content: {
    padding: 20,
  },
  businessName: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    color: "#333",
  },
  receiptType: {
    fontSize: 12,
    textAlign: "center",
    color: "#777",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 15,
  },
  dashedDivider: {
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#ddd",
    marginVertical: 15,
    borderRadius: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: {
    color: "#777",
    fontSize: 14,
  },
  value: {
    color: "#333",
    fontSize: 14,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#aaa",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  amountContainer: {
    alignItems: "center",
    marginVertical: 10,
  },
  amountLabel: {
    fontSize: 14,
    color: "#777",
  },
  amountValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1565c0",
  },
  balanceContainer: {
    backgroundColor: "#f9f9f9",
    padding: 15,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  redBalance: { color: "#d32f2f" },
  greenBalance: { color: "#388e3c" },
  footer: {
    marginTop: 20,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#aaa",
    fontStyle: "italic",
  },
});