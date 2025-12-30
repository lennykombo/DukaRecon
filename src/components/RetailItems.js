import { View, TextInput, TouchableOpacity, Text } from "react-native";


export default function RetailItems({ items, setItems }) {
  function addItem() {
    setItems([...items, { name: "", qty: "1", price: "" }]);
  }

  function updateItem(index, key, value) {
    const copy = [...items];
    copy[index][key] = value; // Keep as string while typing
    setItems(copy);
  }

  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={{ marginBottom: 15, borderBottomWidth: 1, borderColor: '#eee', pb: 10 }}>
          <TextInput
            placeholder="Item name"
            value={item.name}
            onChangeText={(v) => updateItem(i, "name", v)}
            style={{ backgroundColor: "#f9fafb", padding: 12, borderRadius: 10, marginBottom: 8 }}
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              placeholder="Qty"
              keyboardType="numeric"
              value={String(item.qty)}
              onChangeText={(v) => updateItem(i, "qty", v)}
              style={{ flex: 1, backgroundColor: "#f9fafb", padding: 12, borderRadius: 10 }}
            />
            <TextInput
              placeholder="Price"
              keyboardType="numeric"
              value={String(item.price)}
              onChangeText={(v) => updateItem(i, "price", v)}
              style={{ flex: 2, backgroundColor: "#f9fafb", padding: 12, borderRadius: 10 }}
            />
          </View>
        </View>
      ))}

      <TouchableOpacity onPress={addItem} style={{ marginTop: 10 }}>
        <Text style={{ color: "#1565c0", fontWeight: "600" }}>+ Add Item</Text>
      </TouchableOpacity>
    </View>
  );
}














/*import { View, TextInput, TouchableOpacity, Text } from "react-native";

export default function RetailItems({ items, setItems }) {
  function addItem() {
    setItems([...items, { name: "", qty: 1, price: "" }]);
  }

  function updateItem(index, key, value) {
    const copy = [...items];
    copy[index][key] = value;
    setItems(copy);
  }

  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={{ marginBottom: 10 }}>
          <TextInput
            placeholder="Item name"
            value={item.name}
            onChangeText={(v) => updateItem(i, "name", v)}
            style={{ backgroundColor: "#f9fafb",
  padding: 14,
  borderRadius: 10,
  marginBottom: 10,
  fontSize: 16 }}
          />
          <View style={{ flexDirection: "row" }}>
            <TextInput
              placeholder="Qty"
              keyboardType="numeric"
              value={String(item.qty)}
              onChangeText={(v) => updateItem(i, "qty", Number(v))}
              style={{ fbackgroundColor: "#f9fafb",
  padding: 14,
  borderRadius: 10,
  marginBottom: 10,
  fontSize: 16 }}
            />
            <TextInput
              placeholder="Price"
              keyboardType="numeric"
              value={String(item.price)}
              onChangeText={(v) => updateItem(i, "price", Number(v))}
              style={{ backgroundColor: "#f9fafb",
  padding: 14,
  borderRadius: 10,
  marginBottom: 10,
  fontSize: 16 }}
            />
          </View>
        </View>
      ))}

      <TouchableOpacity onPress={addItem}>
        <Text style={{ color: "#1565c0" }}>+ Add Item</Text>
      </TouchableOpacity>
    </View>
  );
}*/
