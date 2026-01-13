/*import BackgroundService from 'react-native-background-actions';
import SmsListener from 'react-native-android-sms-listener';
import { processIncomingSMS } from './smsService';
import { Platform, ToastAndroid } from 'react-native'; // <--- IMPORT TOAST

const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

const smsBackgroundTask = async (taskDataArguments) => {
    const { user } = taskDataArguments;
    
    // DEBUG: Show toast when service starts
    ToastAndroid.show("Service Started: Listening...", ToastAndroid.LONG);

    const subscription = SmsListener.addListener(async (message) => {
        const sender = message.originatingAddress.toUpperCase();
        
        // DEBUG: Show toast when SMS hits (Even if app is closed)
        ToastAndroid.show(`SMS Detected from: ${sender}`, ToastAndroid.LONG);

        try {
            await processIncomingSMS(message.body, sender, user);
            
            // DEBUG: Show toast if upload logic finishes
            ToastAndroid.show("Data Processed to Firebase", ToastAndroid.SHORT);
        } catch (error) {
            // DEBUG: Show toast if error
            ToastAndroid.show(`Error: ${error.message}`, ToastAndroid.LONG);
            console.error(error);
        }
    });

    await new Promise(async (resolve) => {
        while (BackgroundService.isRunning()) {
            await sleep(5000); 
        }
    });

    subscription.remove();
};

const options = {
    taskName: 'DukaReconListener',
    taskTitle: 'DukaRecon Active',
    taskDesc: 'Listening for M-Pesa...',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#1565c0',
    parameters: {
        delay: 1000,
    },
};

export const startBackgroundListener = async (user) => {
    if (Platform.OS !== 'android') return;
    if (!user || !user.businessId) return;

    if (!BackgroundService.isRunning()) {
        await BackgroundService.start(smsBackgroundTask, { ...options, parameters: { user } });
    }
};

export const stopBackgroundListener = async () => {
    await BackgroundService.stop();
};*/
















//latest background service

/*import BackgroundService from 'react-native-background-actions';
import SmsListener from 'react-native-android-sms-listener';
import { processIncomingSMS } from './smsService'; // Your existing logic
import { Platform, Alert } from 'react-native';

// 1. The Task that runs in the background
const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

const smsBackgroundTask = async (taskDataArguments) => {
    const { user } = taskDataArguments;
    
    console.log("DukaRecon Background Service Started for:", user.email);

    // Start Listening
    const subscription = SmsListener.addListener(async (message) => {
        const sender = message.originatingAddress.toUpperCase();
        console.log(`Background SMS received from: ${sender}`);

        // Call your existing logic to parse and save to Firebase
        await processIncomingSMS(message.body, sender, user);
    });

    // Keep the task running infinitely
    await new Promise(async (resolve) => {
        // We loop here to keep the service alive
        while (BackgroundService.isRunning()) {
            await sleep(5000); // Sleep for 5s to save CPU
        }
    });

    // Cleanup
    subscription.remove();
};

// 2. Configuration Options
const options = {
    taskName: 'DukaReconListener',
    taskTitle: 'DukaRecon Active',
    taskDesc: 'Listening for M-Pesa & Bank Payments...',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#1565c0',
    parameters: {
        delay: 1000,
    },
};

// 3. Start Function
export const startBackgroundListener = async (user) => {
    if (Platform.OS !== 'android') return;

    if (!BackgroundService.isRunning()) {
        try {
            await BackgroundService.start(smsBackgroundTask, { ...options, parameters: { user } });
            console.log("Background Service Started Successfully");
        } catch (e) {
            console.log("Error starting background service:", e);
        }
    }
};

// 4. Stop Function (Optional, e.g., on Logout)
export const stopBackgroundListener = async () => {
    await BackgroundService.stop();
};*/


/*import BackgroundService from 'react-native-background-actions';
import SmsListener from 'react-native-android-sms-listener';
import { processIncomingSMS } from './smsService'; // Ensure this path is correct
import { Platform, ToastAndroid } from 'react-native';

const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

// --- THE ACTUAL BACKGROUND TASK ---
const smsBackgroundTask = async (taskDataArguments) => {
    const { user } = taskDataArguments;
    
    // DEBUG: Visual confirmation that the service started
    console.log("✅ Background Service Started");
    ToastAndroid.show("DukaRecon: Service Started", ToastAndroid.SHORT);

    // 1. Start the Listener
    const subscription = SmsListener.addListener(async (message) => {
        const sender = message.originatingAddress.toUpperCase();
        console.log(`📩 Background SMS from: ${sender}`);

        // DEBUG: Visual confirmation when SMS hits (Even if app is closed)
        ToastAndroid.show(`SMS Detected from: ${sender}`, ToastAndroid.LONG);

        try {
            // 2. Process the SMS (Parse & Upload to Firebase)
            // We pass the 'user' object so we know which BusinessID to use
            await processIncomingSMS(message.body, sender, user);
            
            console.log("✅ Background Upload Complete");
        } catch (error) {
            console.error("❌ Background Error:", error);
            ToastAndroid.show("Error saving SMS in background", ToastAndroid.SHORT);
        }
    });

    // 3. Keep the service alive infinitely
    await new Promise(async (resolve) => {
        while (BackgroundService.isRunning()) {
            // We sleep to keep CPU usage low, but the Listener above stays active
            await sleep(5000); 
        }
    });

    // 4. Cleanup
    subscription.remove();
};

// --- CONFIGURATION OPTIONS ---
const options = {
    taskName: 'DukaReconListener',
    taskTitle: 'DukaRecon Active',
    taskDesc: 'Listening for M-Pesa payments...',
    taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
    },
    color: '#2e7d32', // Green
    parameters: {
        delay: 1000,
    },
};

// --- START FUNCTION ---
export const startBackgroundListener = async (user) => {
    if (Platform.OS !== 'android') return;

    // We need the user object to know who to save the data for
    if (!user || !user.businessId) {
        console.log("❌ Cannot start service: User data missing");
        return;
    }

    if (!BackgroundService.isRunning()) {
        try {
            // Start the task defined above, passing the user data
            await BackgroundService.start(smsBackgroundTask, { ...options, parameters: { user } });
            console.log("🚀 Service Initialized");
        } catch (e) {
            console.log("Error starting background service:", e);
        }
    }
};

// --- STOP FUNCTION ---
export const stopBackgroundListener = async () => {
    await BackgroundService.stop();
};*/


import BackgroundService from 'react-native-background-actions';
import SmsAndroid from 'react-native-get-sms-android'; 
import { processIncomingSMS } from './smsService'; 
import { Platform, ToastAndroid } from 'react-native';

const sleep = (time) => new Promise((resolve) => setTimeout(() => resolve(), time));

const smsBackgroundTask = async (taskDataArguments) => {
    const { user } = taskDataArguments;
    
    console.log("🛡️ Security Poller Started");
    ToastAndroid.show("DukaRecon: Protection Active", ToastAndroid.SHORT);

    // --- MEMORY CACHE TO PREVENT LOOPING ---
    // This remembers codes we already processed since the app started
    const processedTransactions = new Set(); 

    while (BackgroundService.isRunning()) {
        try {
            const filter = { box: 'inbox', maxCount: 5 };

            SmsAndroid.list(
                JSON.stringify(filter),
                (fail) => console.log("Read Fail:", fail),
                (count, smsList) => {
                    const messages = JSON.parse(smsList);
                    const now = new Date();
                    
                    messages.forEach(async (msg) => {
                        try {
                            const msgDate = new Date(msg.date).getTime();
                            // Only look at messages from the last 24 hours
                            if (Date.now() - msgDate < 24 * 60 * 60 * 1000) {
                                
                                // Extract the code simply to check duplicates before processing
                                // (We do a rough check here, actual parsing happens in smsService)
                                const body = msg.body;
                                const codeMatch = body.match(/([A-Z0-9]{10})/);
                                const code = codeMatch ? codeMatch[1].toUpperCase() : null;

                                // CRITICAL CHECK:
                                // If we already processed this code in this session, SKIP IT.
                                if (code && processedTransactions.has(code)) {
                                    return; 
                                }

                                // If new, process it
                                const result = await processIncomingSMS(msg.body, msg.address.toUpperCase(), user);
                                
                                // If successfully identified as a transaction, add to cache
                                if (result && result.code) {
                                    processedTransactions.add(result.code);
                                    console.log(`🔒 Cached ${result.code} - Won't re-upload.`);
                                }
                            }
                        } catch (err) {
                            console.error("Msg Process Error", err);
                        }
                    });
                }
            );
        } catch (error) {
            console.error("Poller Error:", error);
        }

        await sleep(10000); 
    }
};

const options = {
    taskName: 'DukaReconListener',
    taskTitle: 'DukaRecon Security',
    taskDesc: 'Monitoring payments...',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#d32f2f', 
    parameters: { delay: 1000 },
};

export const startBackgroundListener = async (user) => {
    if (Platform.OS !== 'android') return;
    if (!user || !user.businessId) return;

    if (!BackgroundService.isRunning()) {
        await BackgroundService.start(smsBackgroundTask, { ...options, parameters: { user } });
    }
};

export const stopBackgroundListener = async () => {
    await BackgroundService.stop();
};