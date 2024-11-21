import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Home() {
  const [text, setText] = useState("");
  // const [inputHeight, setInputHeight] = useState(56);
  const insets = useSafeAreaInsets();

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
        <View style={[styles.header, {height: 60 + insets.top}]}></View>
        <View style={styles.innerContainer}>
          <TextInput
            style={styles.textInput}
            multiline
            value={text}
            // onChangeText={handleTextChange}
            onChangeText={setText}
            
            // scrollEnabled={false}
            placeholder="Type something..."
            placeholderTextColor="#aaa"
            returnKeyType="done"
            submitBehavior="blurAndSubmit" 
            onSubmitEditing={dismissKeyboard}
            // onContentSizeChange={handleContentSizeChange}
          />
        </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    flexGrow: 1, // Ensures scrolling even with small content
  },
  header: {
    width: '100%',
    backgroundColor: "red",
    // paddingVertical: 30,
    // alignItems: "flex-end", // Align to the right
  },
  innerContainer: {
    flex: 1,
    // paddingVertical: 30,
    paddingHorizontal: 15,
    justifyContent: "flex-start", // TextInput starts at the top
    // alignItems: "flex-end", // Align to the right
  },
  textInput: {
    fontSize: 36, // Big text
    lineHeight: 36, // Space between lines
    textAlign: "left", // Align text to the right
    textAlignVertical: "top", // Align text to the top
    // borderColor: "#ddd", // Optional border
    // borderWidth: 1,
    // borderRadius: 8,
    padding: 10,
    width: "100%", // Full width
    backgroundColor: "#fff", // Background color
  },
});

