import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import useWebSocketStore from '../../stores/websocketStore';

export default function Translate() {
  const { 
    tokens, 
    wsError, 
    connectWebSocket, 
    disconnectWebSocket, 
    sendMessage 
  } = useWebSocketStore();

  useEffect(() => {
    // Connect to WebSocket when component mounts
    // connectWebSocket();
    // 
    // // Send a test message
    //
    // sendMessage(
    //   "English", 
    //   "Spanish", 
    //   "Turn your magic on. To me she'd say. Everything you want is a dream away."
    // );
    // console.log("hi")
    // 
    // // Clean up the WebSocket connection when component unmounts
    // return () => {
    //   disconnectWebSocket();
    // };
  }, []);

  return (
    <View style={styles.container}>
        {wsError ? (
          <Text style={styles.errorText}>An error occurred 😫</Text>
        ) : (
          <Text style={styles.translatedText}>
            {Array.from(tokens.entries()).map(([key, value]) => {
              return <Text key={key}>{value.type === 'word' ? value.output : value.value}</Text>
            })}
          </Text> 
        )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: "100%",
    width: "100%",

    backgroundColor: 'red',
  },
  translatedText: {
    fontSize: 36,
    paddingHorizontal: 24,
    paddingVertical: 10,
    textAlign: "left",
    textAlignVertical: "top",
    width: "100%",
    height: "100%",
    backgroundColor: "#fff",
  },
  errorText: {
    color: 'red',
    fontSize: 16,
  },
});
