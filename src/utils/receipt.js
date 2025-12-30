import { Linking, Platform } from "react-native";
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

/**
 * Sends the receipt text to the RawBT app for thermal printing.
 * Requires the 'RawBT Print Service' app to be installed on the Android device.
 */
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
};