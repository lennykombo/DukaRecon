import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator,
  RefreshControl 
} from "react-native";
import { useEffect, useState } from "react";
import { fetchOpenAccounts } from "../services/accounts";
import { DEV_USER } from "../utils/devUser";

export default function AccountListScreen({ navigation }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Function to load and filter the data
  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await fetchOpenAccounts(DEV_USER.businessId);
      
      // Filter out accounts where the debt is already cleared
      const activeAccounts = data.filter(item => {
        const total = Number(item.totalAmount || 0);
        const paid = Number(item.paidAmount || 0);
        return (total - paid) > 0;
      });

      setAccounts(activeAccounts);
    } catch (error) {
      console.error("Error loading accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadAccounts);
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f6f7f9' }}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadAccounts} />
        }
      >
        <Text style={styles.header}>Open Accounts</Text>

        {loading && accounts.length === 0 ? (
          <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 50 }} />
        ) : accounts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No outstanding balances found. 🎉</Text>
          </View>
        ) : (
          accounts.map((item) => {
            // MATH LOGIC
            const total = Number(item.totalAmount || 0);
            const paid = Number(item.paidAmount || 0);
            const balance = total - paid;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => navigation.navigate("AccountDetail", { account: item })}
                style={styles.card}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.description}>{item.description}</Text>
                  <Text style={styles.subText}>Total Price: KES {total.toLocaleString()}</Text>
                  <Text style={styles.subText}>Total Paid: KES {paid.toLocaleString()}</Text>
                </View>
                
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.balanceLabel}>Balance Due</Text>
                  <Text style={styles.balanceValue}>KES {balance.toLocaleString()}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { 
    fontSize: 24, 
    fontWeight: "bold", 
    color: '#333', 
    marginBottom: 20,
    marginTop: 10 
  },
  card: {
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    // Elevation for Android
    elevation: 3,
  },
  description: { 
    fontWeight: "bold", 
    fontSize: 17, 
    color: '#1a1a1a',
    marginBottom: 5 
  },
  subText: { 
    color: '#666', 
    fontSize: 13,
    marginTop: 2 
  },
  balanceLabel: { 
    fontSize: 10, 
    color: '#888', 
    textTransform: 'uppercase', 
    fontWeight: '700' 
  },
  balanceValue: { 
    color: "#d32f2f", 
    fontWeight: 'bold', 
    fontSize: 18, 
    marginTop: 5 
  },
  emptyBox: { 
    marginTop: 60, 
    alignItems: 'center' 
  },
  emptyText: { 
    color: '#999', 
    fontSize: 16,
    textAlign: 'center' 
  }
});