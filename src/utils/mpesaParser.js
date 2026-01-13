// --- PARSER 1: Standard M-Pesa ---
export function parseMpesaSMS(body) {
  if (!body) return null;
  const cleanBody = body.replace(/\r?\n|\r/g, " ");
  
  const regex = /([A-Z0-9]{10})\s*Confirmed\..*?(?:Ksh|KES|KSH)\s?([\d,]+\.\d{2})\s*received\s*from\s*(.*?)(?:\s+(?:on|at|New|Balance|Account|Buy|07\d+|254\d+)|$|\.$)/i;
  
  const match = cleanBody.match(regex);
  if (match) {
    return {
      transactionCode: match[1].toUpperCase(),
      amount: parseFloat(match[2].replace(/,/g, "")),
      sender: match[3].replace(/ -$/, "").trim(),
      type: "mpesa", 
      source: "MPESA"
    };
  }
  return null;
}

// --- PARSER 2: Bank & Sacco Alerts (Updated) ---
export function parseBankSMS(body, senderName) {
  if (!body) return null;
  const cleanBody = body.replace(/\r?\n|\r/g, " ");

  // --- PATTERN A: "Confirmed. KES. 10.00... Ref. CODE on..." (Reverse Format) ---
  const reverseRegex = /Confirmed\.\s*(?:KES|Ksh|KSH)[\.\s]*([\d,]+\.\d{2})\s*from\s*(.*?)\s*(?:Phone|received).*?Ref\.?\s*([A-Z0-9]{10})(?:\s|$)/i;
  const reverseMatch = cleanBody.match(reverseRegex);

  if (reverseMatch) {
    return {
      transactionCode: reverseMatch[3].toUpperCase(),
      amount: parseFloat(reverseMatch[1].replace(/,/g, "")),
      sender: reverseMatch[2].trim(),
      type: "bank",
      source: senderName.toUpperCase()
    };
  }

  // --- PATTERN B: Sacco Format (New) ---
  // "Confirmed. You have received KES 10.00 ... from Joseph through ... Reference no UAA8..."
  const saccoRegex = /Confirmed\..*?(?:KES|Ksh|KSH)\s?([\d,]+\.\d{2}).*?from\s+(.*?)\s+through.*?Reference\s+no\s+([A-Z0-9]{10})/i;
  const saccoMatch = cleanBody.match(saccoRegex);

  if (saccoMatch) {
    return {
      transactionCode: saccoMatch[3].toUpperCase(), // Group 3: Code
      amount: parseFloat(saccoMatch[1].replace(/,/g, "")), // Group 1: Amount
      sender: saccoMatch[2].trim(), // Group 2: Sender (Name between 'from' and 'through')
      type: "bank",
      source: senderName.toUpperCase()
    };
  }

  // --- PATTERN C: Standard Bank Format (Ref at start) ---
  // "Ref: QWE123... Credited..."
  const codeRegex = /(?:Ref|Mpesa|PMT|Tran Id)\s*[:\.]?\s*([A-Z0-9]{10})/i;
  const codeMatch = cleanBody.match(codeRegex);
  const amountRegex = /(?:KES|Ksh|KSH)[\.\s]*([\d,]+\.\d{2})/i;
  const amountMatch = cleanBody.match(amountRegex);
  const nameRegex = /(?:by|from)\s+([A-Z\s]+)(?:\s+on|\s+via|\.$)/i;
  const nameMatch = cleanBody.match(nameRegex);

  if (amountMatch && codeMatch) {
    return {
      transactionCode: codeMatch[1].toUpperCase(),
      amount: parseFloat(amountMatch[1].replace(/,/g, "")),
      sender: nameMatch ? nameMatch[1].trim() : "Client (Via Bank)",
      type: "bank",
      source: senderName.toUpperCase()
    };
  }

  return null;
}

// --- PARSER 3: Expenses ---
export function parseMpesaExpense(body) {
  if (!body) return null;
  const cleanBody = body.replace(/\r?\n|\r/g, " ");
  const codeMatch = cleanBody.match(/^([A-Z0-9]{10})\s*Confirmed\./i);
  if (!codeMatch) return null; 
  const amountMatch = cleanBody.match(/(?:Ksh|KES|KSH)\s?([\d,]+\.\d{2})/i);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  const code = codeMatch[1].toUpperCase();
  let description = "Expense";
  
  const sentToMatch = cleanBody.match(/sent\s*to\s*(.*?)\s+(?:on|for)/i);
  const paidToMatch = cleanBody.match(/paid\s*to\s*(.*?)\s+(?:on|for)/i);
  const boughtMatch = cleanBody.match(/You\s*bought\s*(.*?)(?:\s+on|\.$)/i);

  if (sentToMatch) description = `Sent to ${sentToMatch[1].trim()}`;
  else if (paidToMatch) description = `Paid to ${paidToMatch[1].trim()}`;
  else if (boughtMatch) description = `Bought ${boughtMatch[1].trim()}`;

  return { transactionCode: code, amount, description, paymentMethod: 'mpesa' };
}

// --- PARSER 4: UNIVERSAL FALLBACK (The "Nuclear Option") ---
// Catches ANY message with "Confirmed" + Code + Amount, regardless of order.
export function parseGenericPayment(body) {
  if (!body) return null;
  const cleanBody = body.replace(/\r?\n|\r/g, " ");

  // 1. Check if it's a confirmation message
  if (!/Confirmed/i.test(cleanBody) && !/received/i.test(cleanBody)) {
    return null;
  }

  // 2. Extract Amount (Look for Ksh/KES followed by digits)
  const amountRegex = /(?:Ksh|KES|KSH)[\.\s]*([\d,]+\.\d{2})/i;
  const amountMatch = cleanBody.match(amountRegex);

  // 3. Extract Transaction Code (10 Uppercase Alphanumerics)
  // We ignore common words that look like codes (like PAYBILL, MPESA) if they appear in uppercase
  const codeRegex = /\b([A-Z0-9]{10})\b/; 
  const codeMatch = cleanBody.match(codeRegex);

  if (amountMatch && codeMatch) {
    const code = codeMatch[1].toUpperCase();
    
    // Filter out false positives (like "EQUITYBANK" or "SAFARICOM")
    if (code.length !== 10 || /^(CONFIRMED|RECEIVED|MPESA|BALANCE|ACCOUNT)$/.test(code)) {
      return null;
    }

    return {
      transactionCode: code,
      amount: parseFloat(amountMatch[1].replace(/,/g, "")),
      sender: "Unknown / Paybill", // We might not catch the name, but we catch the money!
      type: "mpesa", // Default to mpesa type so it hits the dashboard
      source: "Manual/Fallback"
    };
  }

  return null;
}












// --- PARSER 1: Standard M-Pesa ---
/*export function parseMpesaSMS(body) {
  if (!body) return null;
  const cleanBody = body.replace(/\r?\n|\r/g, " ");
  const regex = /([A-Z0-9]{10})\s*Confirmed\..*?(?:Ksh|KES|KSH)\s?([\d,]+\.\d{2})\s*received\s*from\s*(.*?)(?:\s+(?:on|at|New|Balance|Account|Buy|07\d+|254\d+)|$|\.$)/i;
  const match = cleanBody.match(regex);
  if (match) {
    return {
      transactionCode: match[1].toUpperCase(),
      amount: parseFloat(match[2].replace(/,/g, "")),
      sender: match[3].replace(/ -$/, "").trim(),
      type: "mpesa", 
      source: "MPESA"
    };
  }
  return null;
}

// --- PARSER 2: Bank Alerts (Updated for your format) ---
export function parseBankSMS(body, senderName) {
  if (!body) return null;
  const cleanBody = body.replace(/\r?\n|\r/g, " ");

  // --- PATTERN A: "Confirmed. KES. 10.00... Ref. CODE on..." ---
  // We added `(?:\s|$)` after the code group to ensure we stop at the space before "on"
  const reverseRegex = /Confirmed\.\s*(?:KES|Ksh|KSH)[\.\s]*([\d,]+\.\d{2})\s*from\s*(.*?)\s*(?:Phone|received).*?Ref\.?\s*([A-Z0-9]{10})(?:\s|$)/i;
  
  const reverseMatch = cleanBody.match(reverseRegex);

  if (reverseMatch) {
    return {
      transactionCode: reverseMatch[3].toUpperCase(),
      amount: parseFloat(reverseMatch[1].replace(/,/g, "")),
      sender: reverseMatch[2].trim(),
      type: "bank",
      source: senderName.toUpperCase()
    };
  }

  // --- PATTERN B: Standard "Ref: CODE... Credited..." ---
  const codeRegex = /(?:Ref|Mpesa|PMT|Tran Id)\s*[:\.]?\s*([A-Z0-9]{10})/i;
  const codeMatch = cleanBody.match(codeRegex);
  const amountRegex = /(?:KES|Ksh|KSH)[\.\s]*([\d,]+\.\d{2})/i;
  const amountMatch = cleanBody.match(amountRegex);
  const nameRegex = /(?:by|from)\s+([A-Z\s]+)(?:\s+on|\s+via|\.$)/i;
  const nameMatch = cleanBody.match(nameRegex);

  if (amountMatch && codeMatch) {
    return {
      transactionCode: codeMatch[1].toUpperCase(),
      amount: parseFloat(amountMatch[1].replace(/,/g, "")),
      sender: nameMatch ? nameMatch[1].trim() : "Client (Via Bank)",
      type: "bank",
      source: senderName.toUpperCase()
    };
  }

  return null;
}

// --- PARSER 3: Expenses ---
export function parseMpesaExpense(body) {
  if (!body) return null;
  const cleanBody = body.replace(/\r?\n|\r/g, " ");
  const codeMatch = cleanBody.match(/^([A-Z0-9]{10})\s*Confirmed\./i);
  if (!codeMatch) return null; 
  const amountMatch = cleanBody.match(/(?:Ksh|KES|KSH)\s?([\d,]+\.\d{2})/i);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  const code = codeMatch[1].toUpperCase();
  let description = "Expense";
  
  const sentToMatch = cleanBody.match(/sent\s*to\s*(.*?)\s+(?:on|for)/i);
  const paidToMatch = cleanBody.match(/paid\s*to\s*(.*?)\s+(?:on|for)/i);
  const boughtMatch = cleanBody.match(/You\s*bought\s*(.*?)(?:\s+on|\.$)/i);

  if (sentToMatch) description = `Sent to ${sentToMatch[1].trim()}`;
  else if (paidToMatch) description = `Paid to ${paidToMatch[1].trim()}`;
  else if (boughtMatch) description = `Bought ${boughtMatch[1].trim()}`;

  return { transactionCode: code, amount, description, paymentMethod: 'mpesa' };
}*/