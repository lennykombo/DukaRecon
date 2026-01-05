import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  ActivityIndicator,
  RefreshControl,
  TextInput // <--- 1. Import TextInput
} from "react-native";
import { useEffect, useState } from "react";
import { fetchOpenAccounts } from "../services/accounts";

export default function AccountListScreen({ navigation, route }) {
  const { user } = route.params; 

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(""); // <--- 2. Search State

  const loadAccounts = async () => {
    if (!user?.businessId) return;

    setLoading(true);
    try {
      const data = await fetchOpenAccounts(user.businessId);
      
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

  // <--- 3. Filter Logic (Search by Name)
  const filteredAccounts = accounts.filter((item) => 
    item.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f6f7f9' }}>
      <View style={styles.fixedHeader}>
       {/*<Text style={styles.header}>Open Accounts</Text>*/}
         
         {/* <--- 4. Search Input UI */}
         <View style={styles.searchContainer}>
           <TextInput 
             style={styles.searchInput}
             placeholder="🔍 Search by name..."
             value={searchQuery}
             onChangeText={setSearchQuery}
             placeholderTextColor="#999"
           />
         </View>
      </View>

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: 10, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadAccounts} />
        }
      >
        {loading && accounts.length === 0 ? (
          <ActivityIndicator size="large" color="#1565c0" style={{ marginTop: 50 }} />
        ) : filteredAccounts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {searchQuery ? "No matching accounts found." : "No outstanding balances found. 🎉"}
            </Text>
          </View>
        ) : (
          filteredAccounts.map((item) => {
            const total = Number(item.totalAmount || 0);
            const paid = Number(item.paidAmount || 0);
            const balance = total - paid;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => navigation.navigate("AccountDetail", { 
                    account: item,
                    user: user 
                })}
                style={styles.card}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.description}>{item.description}</Text>
                  <Text style={styles.subText}>Total: KES {total.toLocaleString()}</Text>
                  <Text style={styles.subText}>Paid: KES {paid.toLocaleString()}</Text>
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
  fixedHeader: {
    backgroundColor: '#f6f7f9',
    paddingHorizontal: 16,
    paddingTop: 10,
    zIndex: 10,
  },
  header: { fontSize: 24, fontWeight: "bold", color: '#333', marginBottom: 15 },
  
  // Search Styles
  searchContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    elevation: 1,
  },
  searchInput: {
    fontSize: 16,
    color: '#333',
    padding: 0, // Removes default padding in Android
  },

  card: {
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  description: { fontWeight: "bold", fontSize: 17, color: '#1a1a1a', marginBottom: 5 },
  subText: { color: '#666', fontSize: 13, marginTop: 2 },
  balanceLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: '700' },
  balanceValue: { color: "#d32f2f", fontWeight: 'bold', fontSize: 18, marginTop: 5 },
  emptyBox: { marginTop: 60, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 16, textAlign: 'center' }
});





















/* import { 
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
// import { DEV_USER } from "../utils/devUser"; // 🗑️ REMOVE THIS

export default function AccountListScreen({ navigation, route }) {
  // 1. Get the real user passed from App.js
  const { user } = route.params; 

  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAccounts = async () => {
    // 2. Guard: Don't fetch if businessId is missing
    if (!user?.businessId) return;

    setLoading(true);
    try {
      // 3. Use the REAL businessId from the logged-in user
      const data = await fetchOpenAccounts(user.businessId);
      
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
            const total = Number(item.totalAmount || 0);
            const paid = Number(item.paidAmount || 0);
            const balance = total - paid;

            return (
              <TouchableOpacity
                key={item.id}
                // 4. Pass the 'user' object to AccountDetail as well
                onPress={() => navigation.navigate("AccountDetail", { 
                    account: item,
                    user: user 
                })}
                style={styles.card}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.description}>{item.description}</Text>
                  <Text style={styles.subText}>Total: KES {total.toLocaleString()}</Text>
                  <Text style={styles.subText}>Paid: KES {paid.toLocaleString()}</Text>
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
  header: { fontSize: 24, fontWeight: "bold", color: '#333', marginBottom: 20, marginTop: 10 },
  card: {
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  description: { fontWeight: "bold", fontSize: 17, color: '#1a1a1a', marginBottom: 5 },
  subText: { color: '#666', fontSize: 13, marginTop: 2 },
  balanceLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase', fontWeight: '700' },
  balanceValue: { color: "#d32f2f", fontWeight: 'bold', fontSize: 18, marginTop: 5 },
  emptyBox: { marginTop: 60, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 16, textAlign: 'center' }
}); */
