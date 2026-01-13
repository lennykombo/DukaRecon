import { Linking, Platform } from "react-native";
import { encode } from 'base-64';

export function formatReceipt(data) {
  const { businessName, account, payment, balanceAfter, items, jobName } = data;
  
  const line = "--------------------------------"; // 32 chars (Standard for 58mm)
  const date = new Date().toLocaleString('en-KE', { hour12: true });
  
  const formatCurrency = (num) => 
    "KES " + Number(num).toLocaleString(undefined, { minimumFractionDigits: 2 });

  let receipt = "";

  // --- HEADER ---
  receipt += `${businessName.toUpperCase()}\n`;
  receipt += "       OFFICIAL RECEIPT       \n";
  receipt += `${line}\n`;
  receipt += `DATE: ${date}\n`;
  
  // --- CONTENT SECTION ---
  if (items && items.length > 0) {
    // RETAIL SALE: List Items
    receipt += "ITEM           QTY      TOTAL\n";
    receipt += `${line}\n`;
    
    items.forEach((item) => {
      // Line 1: Item Name
      receipt += `${item.name}\n`;
      // Line 2: Calculation (Indented)
      // e.g. "   2 x 100 = 200.00"
      const total = item.qty * item.price;
      receipt += `   ${item.qty} x ${item.price} = ${total.toLocaleString()}\n`;
    });
  } else {
    // JOB SALE: Description
    receipt += "DESCRIPTION:\n";
    receipt += `${jobName || account.description || "Job Sale"}\n`;
  }

  // --- TOTALS SECTION ---
  receipt += `${line}\n`;
  
  // Calculate Total Sale Amount (Paid + Balance)
  const totalSale = Number(payment.amount) + Number(balanceAfter);

  receipt += `TOTAL DUE:     ${formatCurrency(totalSale)}\n`;
  receipt += `AMOUNT PAID:   ${formatCurrency(payment.amount)}\n`;
  receipt += `METHOD:        ${payment.paymentMethod.toUpperCase()}\n`;

  if (balanceAfter > 0) {
    receipt += `${line}\n`;
    receipt += `BALANCE DUE:   ${formatCurrency(balanceAfter)}\n`;
    receipt += `CUSTOMER:      ${account.description}\n`;
  }

  // --- FOOTER ---
  receipt += `${line}\n`;
  receipt += "   Thank you for your business!   \n";
  receipt += "      Verified Transaction      \n";
  receipt += `${line}\n\n\n`; // Extra newlines for paper cut

  return receipt;
}

/**
 * Sends the receipt text to the RawBT app for thermal printing.
 */
export const printViaRawBT = (receiptText) => {
  if (Platform.OS !== 'android') {
    alert("Thermal printing is currently only supported on Android devices.");
    return;
  }

  try {
    const base64Text = encode(receiptText);
    const url = `rawbt:base64,${base64Text}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          alert("Please install 'RawBT Print Service' from the Play Store.");
        }
      })
      .catch((err) => {
        console.error("Error opening RawBT:", err);
        alert("Failed to connect to printer app.");
      });
  } catch (error) {
    console.error("Encoding error:", error);
    alert("Could not format receipt for printer.");
  }
};

















/*import { Linking, Platform } from "react-native";
import { encode } from 'base-64';

export function formatReceipt({
  businessName,
  account,
  payment,
  balanceAfter,
}) {
  const line = "--------------------------------"; // 32 chars is standard for 58mm printers
  const date = new Date().toLocaleString();
  
  const formatCurrency = (num) => 
    "KES " + Number(num).toLocaleString(undefined, { minimumFractionDigits: 2 });

  return `
      ${businessName.toUpperCase()}
           OFFICIAL RECEIPT
${line}
DATE: ${date}
TYPE: ${account.type === "job" ? "JOB SERVICE" : "RETAIL CREDIT"}
REF:  ${account.description}
${line}

PAYMENT DETAILS:
Amount Paid:      ${formatCurrency(payment.amount)}
Payment Method:   ${payment.paymentMethod.toUpperCase()}

${line}
SUMMARY:
Current Balance:  ${formatCurrency(balanceAfter)}

${line}
    Thank you for your business!
      Please keep this receipt.
${line}
`.trim();
}


export const printViaRawBT = (receiptText) => {
  if (Platform.OS !== 'android') {
    alert("Thermal printing is currently only supported on Android devices.");
    return;
  }

  try {
    // 1. RawBT expects the text to be Base64 encoded to preserve formatting/spacing
    const base64Text = encode(receiptText);
    
    // 2. Construct the RawBT deep link URL
    const url = `rawbt:base64,${base64Text}`;

    // 3. Check if RawBT is installed and open it
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          alert("Please install 'RawBT Print Service' from the Play Store to use the thermal printer.");
        }
      })
      .catch((err) => {
        console.error("Error opening RawBT:", err);
        alert("Failed to connect to printer app.");
      });
  } catch (error) {
    console.error("Encoding error:", error);
    alert("Could not format receipt for printer.");
  }
};*/