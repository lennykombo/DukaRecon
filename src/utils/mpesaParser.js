export function parseMpesaSMS(body) {
  // 1. Updated Regex to handle the "on [Date] at [Time]" format
  // It captures:
  // Group 1: The Transaction Code
  // Group 2: The Amount
  // Group 3: The Sender Name
  const mpesaRegex = /([A-Z0-9]{10})\s*Confirmed\.\s*.*?Ksh\s?([\d,]+\.\d{2})\s*received\s*from\s*(.*?)\s(?:\d{10,12}|Account)/i;

  const match = body.match(mpesaRegex);

  if (match) {
    const code = match[1].toUpperCase();
    const amount = parseFloat(match[2].replace(/,/g, ""));
    const sender = match[3].trim();

    return {
      transactionCode: code,
      amount: amount,
      sender: sender,
      type: "mpesa",
      timestamp: new Date().toISOString()
    };
  }

  // Fallback for older M-Pesa formats or variations
  const fallbackRegex = /([A-Z0-9]{10})\s*Confirmed\.\s*(?:KES|Ksh)\s?([\d,]+\.\d{2})\s*received/i;
  const fallbackMatch = body.match(fallbackRegex);

  if (fallbackMatch) {
    return {
      transactionCode: fallbackMatch[1].toUpperCase(),
      amount: parseFloat(fallbackMatch[2].replace(/,/g, "")),
      type: "mpesa"
    };
  }

  return null;
}












/*export function parseMpesaSMS(body) {
  // 1. M-PESA PERSONAL/TILL/PAYBILL FORMAT
  const mpesaRegex = /([A-Z0-9]{10})\sConfirmed\.\sKES\s?([\d,]+\.\d{2})\sreceived/i;
  
  // 2. EQUITY BANK EAZZYPAY FORMAT (Example)
  const equityRegex = /TransID:\s([A-Z0-9]+)\..*Amount:\sKES\s?([\d,]+\.\d{2})/i;

  const mpesaMatch = body.match(mpesaRegex);
  const equityMatch = body.match(equityRegex);

  if (mpesaMatch) {
    return {
      transactionCode: mpesaMatch[1],
      amount: parseFloat(mpesaMatch[2].replace(/,/g, "")),
      type: "mpesa"
    };
  }

  if (equityMatch) {
    return {
      transactionCode: equityMatch[1],
      amount: parseFloat(equityMatch[2].replace(/,/g, "")),
      type: "bank"
    };
  }

  return null;
}*/