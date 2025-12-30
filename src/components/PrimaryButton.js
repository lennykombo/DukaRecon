import { TouchableOpacity, Text } from "react-native";
import { colors } from "../utils/theme";

export default function PrimaryButton({ title, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: colors.primary,
        paddingVertical: 18,
        borderRadius: 14,
        marginTop: 24,
      }}
    >
      <Text
        style={{
          color: "#fff",
          textAlign: "center",
          fontSize: 17,
          fontWeight: "600",
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
}
