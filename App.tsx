import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>VIBE LEDGER</Text>
      <Text style={styles.title}>Semantic engine ready</Text>
      <Text style={styles.body}>
        Local-first budgeting foundations are installed. Product screens follow
        after the fixture-backed money model.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0b0f15',
  },
  eyebrow: {
    color: '#9ca9b8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    marginTop: 12,
    color: '#f4f7fa',
    fontSize: 32,
    fontWeight: '700',
  },
  body: {
    marginTop: 12,
    maxWidth: 420,
    color: '#d9e0e7',
    fontSize: 17,
    lineHeight: 25,
  },
});
