import { View } from "react-native";
import { colors, spacing } from "../utils/theme";

export default function Card({ children }) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        padding: spacing.m,
        borderRadius: 12,
        marginBottom: spacing.m,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {children}
    </View>
  );
}
