import { View, Text, TouchableOpacity } from "react-native";
import { colors } from "../utils/theme";

export default function SaleTypeToggle({ value, onChange }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 16 }}>
      {[
        { key: "retail", label: "Retail" },
        { key: "job", label: "Job / Deposit" },
      ].map((t) => (
        <TouchableOpacity
          key={t.key}
          onPress={() => onChange(t.key)}
          style={{
            flex: 1,
            paddingVertical: 14,
            backgroundColor: value === t.key ? colors.primary : "#e5e7eb",
            borderRadius: 10,
            marginRight: 8,
          }}
        >
          <Text
            style={{
              color: value === t.key ? "#fff" : "#111",
              textAlign: "center",
              fontWeight: "600",
            }}
          >
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
