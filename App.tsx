import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { initializeApplication } from './src/app/startup';

type Readiness = 'PREPARING' | 'READY' | 'FAILED';

export default function App() {
  const [readiness, setReadiness] = useState<Readiness>('PREPARING');

  useEffect(() => {
    let active = true;

    initializeApplication().then(
      () => {
        if (active) {
          setReadiness('READY');
        }
      },
      () => {
        if (active) {
          setReadiness('FAILED');
        }
      },
    );

    return () => {
      active = false;
    };
  }, []);

  if (readiness === 'PREPARING') {
    return (
      <Screen
        title="Preparing local ledger"
        body="Applying durable local database migrations."
      />
    );
  }

  if (readiness === 'FAILED') {
    return (
      <Screen
        title="Local ledger unavailable"
        body="The local database could not be prepared. Restart the app to try again."
      />
    );
  }

  return (
    <Screen
      title="Semantic engine ready"
      body="Local-first budgeting foundations are installed. Product screens follow after the fixture-backed money model."
    />
  );
}

function Screen({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>VIBE LEDGER</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
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
