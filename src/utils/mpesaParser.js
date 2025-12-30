export function parseMpesaSMS(body) {
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
}