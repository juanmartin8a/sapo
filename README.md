# SAPO

SAPO is an Expo, React Native, and TypeScript app using Expo Router.

## Project structure

- `app/`: Expo Router route and layout adapters only
- `components/`: feature screens and reusable UI
- `hooks/`: reusable React behavior
- `providers/`: app-wide lifecycle and synchronization components
- `lib/`: authentication, purchases, streaming, and native integrations
- `stores/`: Zustand application state
- `constants/`: static configuration and domain data
- `types/`: shared TypeScript contracts
- `utils/`: pure, framework-independent helpers
- `convex/`: backend submodule and generated Convex bindings

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
    npm run start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

Add navigation entries in `app/`, but keep screen implementations and non-route code outside that directory. See the [Expo Router core concepts](https://docs.expo.dev/router/basics/core-concepts/) for the file-based routing rules.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
