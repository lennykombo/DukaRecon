import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useState } from "react";
import { signUpAttendant } from "../services/auth";

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password || !name || !shopId) {
      alert("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      await signUpAttendant(email, password, name, shopId.trim().toUpperCase());
      // App.js will automatically switch to the Main App because of onAuthStateChanged
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Join a Shop</Text>
      <Text style={styles.subtitle}>Enter the Shop ID provided by your manager</Text>

      <TextInput 
        placeholder="Full Name" 
        style={styles.input} 
        onChangeText={setName} 
      />
      <TextInput 
        placeholder="Email Address" 
        style={styles.input} 
        onChangeText={setEmail} 
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput 
        placeholder="Password" 
        style={styles.input} 
        onChangeText={setPassword} 
        secureTextEntry 
      />
      <TextInput 
        placeholder="Shop ID (e.g. BIZ-XXXXX)" 
        style={[styles.input, styles.shopIdInput]} 
        onChangeText={setShopId} 
        autoCapitalize="characters"
      />

      <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register & Join</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Login")} style={{ marginTop: 20 }}>
        <Text style={{ color: '#777' }}>Already have an account? <Text style={{ color: '#1565c0', fontWeight: 'bold' }}>Login</Text></Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  subtitle: { color: '#777', marginBottom: 30 },
  input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, marginBottom: 15, borderBasis: 1, borderColor: '#eee', borderWidth: 1 },
  shopIdInput: { borderColor: '#1565c0', borderWidth: 1.5, fontWeight: 'bold', color: '#1565c0' },
  button: { backgroundColor: '#1565c0', padding: 18, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});