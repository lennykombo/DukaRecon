import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useState } from "react";
import { loginUser } from "../services/auth";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return alert("Enter email and password");
    setLoading(true);
    try {
      await loginUser(email, password);
      // App.js will automatically switch to Main because of onAuthStateChanged
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>DukaRecon</Text>
      <Text style={styles.subtitle}>Attendant Portal</Text>

      <TextInput 
        placeholder="Email" 
        style={styles.input} 
        onChangeText={setEmail}
        autoCapitalize="none"
      />
      <TextInput 
        placeholder="Password" 
        secureTextEntry 
        style={styles.input} 
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
        <Text style={{ color: '#1565c0', marginTop: 20 }}>
         Don't have an account? Sign up here
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 30, backgroundColor: '#fff' },
  logo: { fontSize: 32, fontWeight: 'bold', color: '#1565c0', textAlign: 'center' },
  subtitle: { textAlign: 'center', color: '#777', marginBottom: 40 },
  input: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
  button: { backgroundColor: '#1565c0', padding: 18, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});