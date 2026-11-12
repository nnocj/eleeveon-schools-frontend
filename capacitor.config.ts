import type { CapacitorConfig } from "@capacitor/cli";

// Native-only PREVIEW build: do not edit next.config.ts and do not use the
// Cloud site as a server.url. Production Cloud builds retain the old webDir.
const isIndependentPreview = process.env.ELEEVEON_NATIVE_PREVIEW === "1";
const config: CapacitorConfig = {
  appId: "com.eleeveon.schools",
  appName: isIndependentPreview ? "Eleeveon Independent Preview" : "Eleeveon Schools",
  webDir: isIndependentPreview ? "independent-native-dist" : "out",
};
export default config;
