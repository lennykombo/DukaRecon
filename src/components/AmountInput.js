import { TextInput } from "react-native";

export default function AmountInput({ value, onChange }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="numeric"
      placeholder="Enter amount"
      style={{
        backgroundColor: "#f9fafb",
  padding: 14,
  borderRadius: 10,
  marginBottom: 10,
  fontSize: 16,
      }}
    />
  );
}
