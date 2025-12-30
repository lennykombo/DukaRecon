import AsyncStorage from "@react-native-async-storage/async-storage";

const JOBS_KEY = "JOBS";
const PAYMENTS_KEY = "PAYMENTS";

// ---------- JOBS ----------
export async function saveJob(job) {
  const jobs = await getJobs();
  await AsyncStorage.setItem(JOBS_KEY, JSON.stringify([...jobs, job]));
}

export async function getJobs() {
  const data = await AsyncStorage.getItem(JOBS_KEY);
  return data ? JSON.parse(data) : [];
}

// ---------- PAYMENTS ----------
export async function savePayment(payment) {
  const payments = await getPayments();
  await AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify([...payments, payment]));
}

export async function getPayments() {
  const data = await AsyncStorage.getItem(PAYMENTS_KEY);
  return data ? JSON.parse(data) : [];
}

export async function getPaymentsForJob(jobId) {
  const payments = await getPayments();
  return payments.filter(p => p.jobId === jobId);
}
