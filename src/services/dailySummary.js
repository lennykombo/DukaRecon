export function dailySummary(payments, reconciliation) {
  const totalExpected = payments.reduce((s, p) => s + p.amount, 0);
  const totalMatched = reconciliation.matched.reduce(
    (s, m) => s + m.payment.amount,
    0
  );

  return {
    totalExpected,
    totalMatched,
    missingAmount: totalExpected - totalMatched,
    missingCount: reconciliation.unmatchedPayments.length,
    extraMoneyCount: reconciliation.unmatchedMoney.length,
  };
}
