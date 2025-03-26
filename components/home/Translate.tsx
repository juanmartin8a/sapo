import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Token {
  type: string;
  input?: string;
  transcription?: string;
  output?: string;
  value?: string;
}

export default function Translate() {
  const [tokens, setTokens] = useState<Map<number, Token>>(new Map());
  const [wsError, setWebSocketError] = useState<boolean>(false)

  useEffect(() => {
    let socket: WebSocket | null = null;
    
    const connectWebSocket = () => {
      socket = new WebSocket('wss://gy2rem2fsd.execute-api.us-east-2.amazonaws.com/prod/');
      
      socket.onopen = () => {
        console.log('WebSocket connection established');
        
        const message = {
          action: "translate", 
          message: JSON.stringify({
            input_language: "Spanish",
            target_language: "German",
            input: "Hola! como estas? Me puedes ayudar diciéndome donde esta la estación de metro mas cercana porfavor?"
          })
        };
        
        socket?.send(JSON.stringify(message));
      };

      socket.onmessage = (event) => {
        console.log('Message received:', event.data);
        
        if (event.data.includes('<end:)>')) {
          socket?.close();
        } else if (event.data.includes('<error:/>')) {
          setWebSocketError(true)
          socket?.close();
        } else {
          try {
            const token: Token = JSON.parse(event.data);

            setTokens(prev => {
              const newTokens = new Map(prev);
              newTokens.set(prev.size === 0 ? 0 : Array.from(prev.keys()).pop()! + 1, token)
              return newTokens
            })

          } catch (error) {
            setWebSocketError(true)
            socket?.close();
            console.error('Error parsing response:', error);
          }
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWebSocketError(true)
        socket?.close();
      };

      socket.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
      };
    };
    
    connectWebSocket();
    
    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, []);

  return (
    <View style={styles.container}>
        { wsError ? (
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
