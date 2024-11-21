import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack 
        screenOptions={{
          headerShown: false, // Hides the default header
        }}
    >
      <Stack.Screen name="(home)"/>
    </Stack>
  );
}
