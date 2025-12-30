const TIME_WINDOW_MINUTES = 5;

function minutesDiff(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / 60000;
}

export function reconcile(payments, moneyEvents) {
  const matched = [];
  const unmatchedPayments = [];
  const unmatchedMoney = [...moneyEvents];

  payments.forEach(payment => {
    const matchIndex = unmatchedMoney.findIndex(event =>
      event.amount === payment.amount &&
      event.method === payment.paymentMethod &&
      minutesDiff(event.time, payment.createdAt) <= TIME_WINDOW_MINUTES
    );

    if (matchIndex >= 0) {
      matched.push({
        payment,
        moneyEvent: unmatchedMoney[matchIndex],
      });
      unmatchedMoney.splice(matchIndex, 1);
    } else {
      unmatchedPayments.push(payment);
    }
  });

  return {
    matched,
    unmatchedPayments,   // ⚠️ recorded but no money
    unmatchedMoney,      // ⚠️ money with no record
  };
}
