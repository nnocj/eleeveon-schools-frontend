ELEEVEON SCHOOLS — ANDROID STAGE 2 SECURITY DROP-IN

Replace only:
android/app/src/main/java/com/eleeveon/schools/EleeveonIndependentPlugin.java

Extract archive into frontend repository root (preserves paths).
From android/: ./gradlew.bat :app:assembleDebug --rerun-tasks
Then install using adb install -r app/build/outputs/apk/debug/app-debug.apk
Run existing SAFE diagnostics with no network. No data writes are performed.

Security changes:
- Native ES256 SHA-256/P-256 signature verification against packaged SPKI keys.
- WebCrypto P1363 64-byte signature converted to Android DER format.
- Checks installation ID, dates, major version, edition, limits, and account ID.
- License import and account retrieval now require verified certificate.
- Snapshot save and restore now require a verified, unexpired certificate.
- Snapshot restore checks certificate account against stored account.

IMPORTANT LIMITATIONS / RELEASE GATES:
- No live license provided; valid signed certificate integration NOT tested.
- No Android Gradle compilation performed in this environment.
- Current license issuance must use WebCrypto-compatible 64-byte ES256 signatures.
- APP_MAJOR_VERSION is currently 1; align with release version policy.
- Local clock rollback, snapshot rollback, per-record quotas, multi-device policy,
  key rotation/revocation, and secure recovery are NOT solved here.
- Keep write operations disabled until valid/invalid license and persistence tests pass.
- Do not copy issuer private keys into mobile application.
- Cloud pilots and backend unchanged.
