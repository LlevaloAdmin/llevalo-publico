# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Firebase Push notifications

Configure these public build variables in Vercel, then redeploy the web app:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`

In Render, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the Firebase Admin service-account JSON. Keep this private value in Render only; do not commit it or share it in chat.

For Android APK builds, add the GitHub Actions secret `GOOGLE_SERVICES_JSON_BASE64`: encode the Firebase Android `google-services.json` file as Base64 and save the result as the secret. The package name in that Firebase Android app must be `com.llevalo.app`. The JSON file is ignored locally and generated from the Actions secret during CI.

The app requests location and notification permissions at startup; location is required to continue and the native app offers device settings or exit when it is unavailable. Repartidores must also connect to the radar to receive work alerts. Web and Android work notifications offer “Postularme” and “Ignorar”; Android shows a native countdown. After an order is completed, both participants can rate each other once. Reputation is based on average stars: Bronze (<3), Silver (3), Gold (4), Platinum (4.5), and Diamond (4.8); unrated accounts remain New. The header shows the official USD/VES exchange rate.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
