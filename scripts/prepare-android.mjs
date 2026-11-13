import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const MANIFEST_PATH = path.join(ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');
const APP_GRADLE_PATH = path.join(ANDROID_DIR, 'app', 'build.gradle');
const VARIABLES_GRADLE_PATH = path.join(ANDROID_DIR, 'variables.gradle');
const KEYSTORE_PATH = path.join(ANDROID_DIR, 'app', 'release-key.jks');

const ADMOB_APP_ID = 'ca-app-pub-8592915239178695~4656930184';

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', cwd: ROOT_DIR });
}

function patchAndroidManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`AndroidManifest.xml not found at ${MANIFEST_PATH}`);
  }

  let manifest = fs.readFileSync(MANIFEST_PATH, 'utf8');

  const permissions = [
    'android.permission.INTERNET',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.WAKE_LOCK',
  ];

  for (const perm of permissions) {
    if (!manifest.includes(`android:name="${perm}"`)) {
      manifest = manifest.replace(
        /<application\b/,
        `    <uses-permission android:name="${perm}" />\n\n    <application`
      );
    }
  }

  if (!manifest.includes('android.hardware.microphone')) {
    manifest = manifest.replace(
      /<application\b/,
      `    <uses-feature android:name="android.hardware.microphone" android:required="false" />\n\n    <application`
    );
  }

  const adMobMetaTag = `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${ADMOB_APP_ID}"/>`;

  if (manifest.includes('com.google.android.gms.ads.APPLICATION_ID')) {
    manifest = manifest.replace(
      /<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*\/>/,
      adMobMetaTag
    );
  } else {
    manifest = manifest.replace(/<\/application>/, `        ${adMobMetaTag}\n    </application>`);
  }

  fs.writeFileSync(MANIFEST_PATH, manifest, 'utf8');
  console.log('Updated AndroidManifest.xml with permissions and AdMob Application ID.');
}

function patchVariablesGradle() {
  if (!fs.existsSync(VARIABLES_GRADLE_PATH)) return;
  let vars = fs.readFileSync(VARIABLES_GRADLE_PATH, 'utf8');
  vars = vars.replace(/compileSdkVersion\s*=\s*\d+/g, 'compileSdkVersion = 34');
  vars = vars.replace(/targetSdkVersion\s*=\s*\d+/g, 'targetSdkVersion = 34');
  fs.writeFileSync(VARIABLES_GRADLE_PATH, vars, 'utf8');
  console.log('Verified compileSdkVersion = 34 and targetSdkVersion = 34 in variables.gradle.');
}

function generateKeystore() {
  if (fs.existsSync(KEYSTORE_PATH)) {
    fs.unlinkSync(KEYSTORE_PATH);
  }
  run(
    `keytool -genkeypair -v -keystore "${KEYSTORE_PATH}" -alias ludoyaari -keyalg RSA -keysize 2048 -validity 10000 -storepass ludoyaari123 -keypass ludoyaari123 -dname "CN=Krisha Apps, OU=Games, O=KrishaApps, L=Mumbai, S=MH, C=IN"`
  );
  console.log(`Generated release keystore at ${KEYSTORE_PATH}.`);
}

function patchAppGradleSigning() {
  if (!fs.existsSync(APP_GRADLE_PATH)) {
    throw new Error(`app/build.gradle not found at ${APP_GRADLE_PATH}`);
  }

  let gradle = fs.readFileSync(APP_GRADLE_PATH, 'utf8');

  const signingBlock = `    signingConfigs {
        release {
            storeFile file('release-key.jks')
            storePassword 'ludoyaari123'
            keyAlias 'ludoyaari'
            keyPassword 'ludoyaari123'
            v1SigningEnabled true
            v2SigningEnabled true
        }
    }
`;

  if (!gradle.includes('signingConfigs')) {
    if (gradle.includes('buildTypes {')) {
      gradle = gradle.replace(/(\s*buildTypes\s*\{)/, `\n${signingBlock}$1`);
    } else {
      throw new Error('Could not locate buildTypes block in android/app/build.gradle');
    }
  }

  if (!gradle.includes('signingConfig signingConfigs.release')) {
    gradle = gradle.replace(
      /(buildTypes\s*\{\s*release\s*\{)/,
      `$1\n            signingConfig signingConfigs.release`
    );
  }

  fs.writeFileSync(APP_GRADLE_PATH, gradle, 'utf8');
  console.log('Configured signingConfigs.release (v1 + v2) in android/app/build.gradle.');
}

function main() {
  console.log('Preparing clean Capacitor Android project for Ludo Yaari...');
  if (fs.existsSync(ANDROID_DIR)) {
    fs.rmSync(ANDROID_DIR, { recursive: true, force: true });
  }

  run('npx cap add android');
  run('npx cap sync android');

  patchVariablesGradle();
  patchAndroidManifest();
  generateKeystore();
  patchAppGradleSigning();

  console.log('\nAndroid project preparation complete.');
}

main();
