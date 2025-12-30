import { View, TextInput, Text } from "react-native";

export default function JobSale({ jobName, setJobName, jobTotal, setJobTotal, paid, setPaid }) {
  const balance = Number(jobTotal || 0) - Number(paid || 0);

  return (
    <View>
      <TextInput
        placeholder="Job name"
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
}
