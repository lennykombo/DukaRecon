import Printer, { COMMANDS } from '@haroldtran/react-native-thermal-printer';
import { Platform } from 'react-native';

export const printToBluetooth = async (receiptData) => {
  try {
    // 1. Initialize
    await Printer.init();

    // 2. Scan for devices (attendant picks the one usually named 'MTP-2' or '58mm')
    const devices = await Printer.getBluetoothDeviceList();
    if (devices.length === 0) {
      alert("No Bluetooth printers found. Make sure it is paired in phone settings.");
      return;
    }

    // For simplicity, we connect to the first paired device. 
    // In a real app, you'd show a list to the user.
    const targetDevice = devices[0]; 

    await Printer.connectBluetooth(targetDevice.address);

    // 3. Format Receipt with ESC/POS Commands
    const BOLD_ON = COMMANDS.TEXT_FORMAT.TXT_BOLD_ON;
    const BOLD_OFF = COMMANDS.TEXT_FORMAT.TXT_BOLD_OFF;
    const CENTER = COMMANDS.TEXT_FORMAT.TXT_ALIGN_CT;
    const LINE = "--------------------------------\n";

    let text = `${CENTER}${BOLD_ON}${receiptData.businessName}${BOLD_OFF}\n`;
    text += `${CENTER}OFFICIAL RECEIPT\n`;
    text += LINE;
    text += `DATE: ${new Date().toLocaleDateString()}\n`;
    text += `REF:  ${receiptData.account.description}\n`;
    text += LINE;
    text += `PAID:     KES ${receiptData.payment.amount}\n`;
    text += `METHOD:   ${receiptData.payment.paymentMethod.toUpperCase()}\n`;
    text += LINE;
    text += `${BOLD_ON}BALANCE:  KES ${receiptData.balanceAfter}${BOLD_OFF}\n`;
    text += LINE;
    text += `\n${CENTER}Thank you!\n\n\n\n`; // Extra lines to help tear paper

    // 4. Send to printer
    await Printer.printText(text);
    
    // 5. Close connection
    await Printer.closeBluetooth();
  } catch (error) {
    console.error("Printing error:", error);
    alert("Could not print: " + error.message);
  }
};