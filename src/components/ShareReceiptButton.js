import { Share, TouchableOpacity, Text } from "react-native";


export default function ShareReceiptButton({ receiptText }) {
  async function share() {
    try {
      await Share.share({ message: receiptText });
    } catch (e) {
      console.log("Share failed", e);
    }
  }

  return (
    <TouchableOpacity
      onPress={share}
      style={{
        marginTop: 10,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: "#e5e7eb",
      }}
    >
      <Text style={{ textAlign: "center", fontWeight: "600" }}>
        Share Receipt
      </Text>
    </TouchableOpacity>
  );
}
