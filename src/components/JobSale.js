import { View, TextInput, Text, StyleSheet } from "react-native";

export default function JobSale({ jobName, setJobName, jobTotal, setJobTotal, paid, setPaid }) {
  const balance = Number(jobTotal || 0) - Number(paid || 0);

  return (
    <View>
      <TextInput
        placeholder="Job name"
        placeholderTextColor="#333"  
        value={jobName}
        onChangeText={setJobName}
        style={styles.input}
      />

      <TextInput
        placeholder="Job total"
        placeholderTextColor="#333"  
        keyboardType="numeric"
        value={jobTotal}
        onChangeText={setJobTotal}
        style={styles.input}
      />

      <TextInput
        placeholder="Amount paid now"
        placeholderTextColor="#333" 
        keyboardType="numeric"
        value={paid}
        onChangeText={setPaid}
        style={styles.input}
      />

      <Text style={styles.balanceText}>
        Balance: <Text style={{ color: balance > 0 ? "#d32f2f" : "#2e7d32" }}>{balance.toLocaleString()}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#f9fafb",
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    fontSize: 16,
    color: "#333" 
  },
  balanceText: {
    color: "#333",
    fontWeight: "bold",
    marginTop: 5,
    fontSize: 16
  }
});











/*import { View, TextInput, Text } from "react-native";

export default function JobSale({ jobName, setJobName, jobTotal, setJobTotal, paid, setPaid }) {
  const balance = Number(jobTotal || 0) - Number(paid || 0);

  return (
    <View>
      <TextInput
        placeholder="Job name"
        placeholderTextColor="#333"
        value={jobName}
        onChangeText={setJobName}
        style={{ backgroundColor: "#f9fafb",
  padding: 14,
  borderRadius: 10,
  marginBottom: 10,
  fontSize: 16 }}
      />

      <TextInput
        placeholder="Job total"
        placeholderTextColor="#333"
        keyboardType="numeric"
        value={jobTotal}
        onChangeText={setJobTotal}
        style={{ backgroundColor: "#f9fafb",
  padding: 14,
  borderRadius: 10,
  marginBottom: 10,
  fontSize: 16 }}
      />

      <TextInput
        placeholder="Amount paid now"
        placeholderTextColor="#333"
        keyboardType="numeric"
        value={paid}
        onChangeText={setPaid}
        style={{ backgroundColor: "#f9fafb",
  padding: 14,
  borderRadius: 10,
  marginBottom: 10,
  fontSize: 16 }}
      />

      <Text>Balance: {balance}</Text>
    </View>
  );
}*/
