import { View, Text, TouchableOpacity } from "react-native";
import { colors } from "../utils/theme";

const METHODS = [
  { key: "cash", label: "Cash" },
  { key: "mpesa_till", label: "M-Pesa Till" },
  { key: "paybill", label: "Paybill" },
  { key: "bank", label: "Bank" },
];

export default function PaymentToggle({ value, onChange }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ marginBottom: 14, fontSize:18, fontWeight:"500", color: colors.muted }}>
        Choose Payment Method
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m.key}
            onPress={() => onChange(m.key)}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              backgroundColor: value === m.key ? colors.primary : "#e5e7eb",
              borderRadius: 20,
              marginRight: 8,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: value === m.key ? "#fff" : "#111" }}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
