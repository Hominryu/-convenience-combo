import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "편의점꿀조합",
  brand: {
    primaryColor: "#16A34A",
  },
  permissions: [],
  navigationBar: {
    withBackButton: true,
    withHomeButton: true,
    theme: "light",
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: "never",
    allowsBackForwardNavigationGestures: true,
  },
  webBundleDir: "dist",
});
