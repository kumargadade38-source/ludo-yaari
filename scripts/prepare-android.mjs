import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT_DIR = process.cwd();
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const RES_DIR = path.join(ANDROID_DIR, 'app', 'src', 'main', 'res');
const MANIFEST_PATH = path.join(ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');
const APP_GRADLE_PATH = path.join(ANDROID_DIR, 'app', 'build.gradle');
const VARIABLES_GRADLE_PATH = path.join(ANDROID_DIR, 'variables.gradle');
const KEYSTORE_PATH = path.join(ANDROID_DIR, 'app', 'release-key.jks');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'release-artifacts');

const ADMOB_APP_ID = 'ca-app-pub-8592915239178695~4656930184';

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', cwd: ROOT_DIR });
}

function buildLudoYaariIconSvg() {
  // Bold optical-centered vector paths for "YAARI" (x: 109..403, y: 388..452)
  const yaariLetters = `
    <path d="M109 388 L128 388 L137 412 L146 388 L165 388 L146 426 L146 454 L128 454 L128 426 Z"/>
    <path fill-rule="evenodd" d="M194 388 L214 388 L233 454 L214 454 L210 440 L198 440 L194 454 L175 454 Z M204 405 L199 426 L209 426 Z"/>
    <path fill-rule="evenodd" d="M262 388 L282 388 L301 454 L282 454 L278 440 L266 440 L262 454 L243 454 Z M272 405 L267 426 L277 426 Z"/>
    <path fill-rule="evenodd" d="M311 388 L350 388 C362 388 369 396 369 408 C369 418 364 425 355 428 L370 454 L350 454 L337 430 L329 430 L329 454 L311 454 Z M329 402 L329 417 L344 417 C349 417 351 414 351 409.5 C351 405 349 402 344 402 Z"/>
    <path d="M379 388 L403 388 L403 454 L379 454 Z"/>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="royalBg" cx="50%" cy="32%" r="72%">
      <stop offset="0%" stop-color="#4328A8"/>
      <stop offset="48%" stop-color="#221266"/>
      <stop offset="100%" stop-color="#0D062E"/>
    </radialGradient>

    <linearGradient id="goldFrame" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FEF08A"/>
      <stop offset="28%" stop-color="#FACC15"/>
      <stop offset="65%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#B45309"/>
    </linearGradient>

    <linearGradient id="goldText" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFBEB"/>
      <stop offset="25%" stop-color="#FDE047"/>
      <stop offset="70%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>

    <linearGradient id="redTile" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF5C6C"/>
      <stop offset="100%" stop-color="#C81E2E"/>
    </linearGradient>
    <linearGradient id="greenTile" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4ADE80"/>
      <stop offset="100%" stop-color="#15803D"/>
    </linearGradient>
    <linearGradient id="blueTile" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8"/>
      <stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>
    <linearGradient id="yellowTile" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FEF08A"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>

    <linearGradient id="diceTop" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="70%" stop-color="#F1F5F9"/>
      <stop offset="100%" stop-color="#DCE4F0"/>
    </linearGradient>
    <linearGradient id="diceRight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#CBD5E1"/>
      <stop offset="100%" stop-color="#94A3B8"/>
    </linearGradient>
    <linearGradient id="diceBottom" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#94A3B8"/>
      <stop offset="100%" stop-color="#64748B"/>
    </linearGradient>

    <linearGradient id="ribbonGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3B1D8E"/>
      <stop offset="100%" stop-color="#1A0B4B"/>
    </linearGradient>

    <linearGradient id="topSheen" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>

    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#050214" flood-opacity="0.65"/>
    </filter>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="#FBBF24" flood-opacity="0.45"/>
    </filter>
  </defs>

  <!-- Full-bleed Royal Purple Gaming Backdrop -->
  <rect width="512" height="512" fill="url(#royalBg)"/>

  <!-- Subtle Radial Starburst Beams -->
  <g opacity="0.14" fill="#C4B5FD">
    <polygon points="256,220 120,0 200,0"/>
    <polygon points="256,220 312,0 392,0"/>
    <polygon points="256,220 512,60 512,150"/>
    <polygon points="256,220 512,270 512,350"/>
    <polygon points="256,220 0,60 0,150"/>
    <polygon points="256,220 0,270 0,350"/>
  </g>

  <!-- Outer Gold Bevel Gaming Frame -->
  <rect x="18" y="18" width="476" height="476" rx="102" fill="none" stroke="url(#goldFrame)" stroke-width="14"/>
  <rect x="28" y="28" width="456" height="456" rx="92" fill="none" stroke="#FEF9C3" stroke-opacity="0.4" stroke-width="3"/>

  <!-- Glossy Top Highlight Arc -->
  <path d="M40 124 C40 60 88 30 156 30 L356 30 C424 30 472 60 472 124 C472 152 380 182 256 182 C132 182 40 152 40 124 Z" fill="url(#topSheen)"/>

  <!-- 4 Classic Ludo Color Quadrants Board Emblem -->
  <g filter="url(#dropShadow)">
    <!-- Board Gold/White Outer Rim -->
    <rect x="92" y="54" width="328" height="304" rx="46" fill="#3B1A08" stroke="url(#goldFrame)" stroke-width="8"/>
    <rect x="102" y="64" width="308" height="284" rx="38" fill="#FFFDF7"/>

    <!-- Top-Left: Red -->
    <rect x="112" y="74" width="139" height="127" rx="26" fill="url(#redTile)"/>
    <circle cx="152" cy="114" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="152" cy="114" r="7" fill="#DC2626"/>
    <circle cx="196" cy="114" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="196" cy="114" r="7" fill="#DC2626"/>
    <circle cx="152" cy="158" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="152" cy="158" r="7" fill="#DC2626"/>

    <!-- Top-Right: Green -->
    <rect x="261" y="74" width="139" height="127" rx="26" fill="url(#greenTile)"/>
    <circle cx="316" cy="114" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="316" cy="114" r="7" fill="#16A34A"/>
    <circle cx="360" cy="114" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="360" cy="114" r="7" fill="#16A34A"/>
    <circle cx="360" cy="158" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="360" cy="158" r="7" fill="#16A34A"/>

    <!-- Bottom-Left: Blue -->
    <rect x="112" y="211" width="139" height="127" rx="26" fill="url(#blueTile)"/>
    <circle cx="152" cy="252" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="152" cy="252" r="7" fill="#2563EB"/>
    <circle cx="152" cy="296" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="152" cy="296" r="7" fill="#2563EB"/>
    <circle cx="196" cy="296" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="196" cy="296" r="7" fill="#2563EB"/>

    <!-- Bottom-Right: Yellow -->
    <rect x="261" y="211" width="139" height="127" rx="26" fill="url(#yellowTile)"/>
    <circle cx="360" cy="252" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="360" cy="252" r="7" fill="#CA8A04"/>
    <circle cx="316" cy="296" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="316" cy="296" r="7" fill="#CA8A04"/>
    <circle cx="360" cy="296" r="14" fill="#FFFFFF" fill-opacity="0.92"/>
    <circle cx="360" cy="296" r="7" fill="#CA8A04"/>

    <!-- Center Gold Star Backing -->
    <circle cx="256" cy="206" r="78" fill="#1E105A" stroke="url(#goldFrame)" stroke-width="6"/>
  </g>

  <!-- Shiny White 3D Dice Showing 6 Dots in Center -->
  <g transform="translate(256 202) rotate(-9)" filter="url(#dropShadow)">
    <!-- 3D Extruded Bottom & Right Cube Faces -->
    <path d="M-54 62 L58 62 C68 62 76 54 76 44 L76 -42 L88 -28 L88 52 C88 68 74 80 58 80 L-38 80 Z" fill="url(#diceBottom)"/>
    <path d="M62 -56 L78 -42 C84 -36 86 -28 86 -18 L86 48 C86 60 76 68 64 68 L52 58 Z" fill="url(#diceRight)"/>

    <!-- Main Glossy White Dice Face -->
    <rect x="-66" y="-66" width="132" height="132" rx="28" fill="url(#diceTop)" stroke="#FFFFFF" stroke-width="3"/>
    <!-- Inner Subtle Gloss Reflection -->
    <path d="M-54 -40 C-54 -52 -44 -58 -30 -58 L32 -58 C46 -58 54 -50 54 -38 C54 -20 18 -14 -54 -26 Z" fill="#FFFFFF" opacity="0.85"/>

    <!-- 6 Crisp 3D Pips (2 Columns of 3) -->
    <g fill="#1E1B4B">
      <circle cx="-30" cy="-34" r="12.5"/>
      <circle cx="30" cy="-34" r="12.5"/>
      <circle cx="-30" cy="0" r="12.5"/>
      <circle cx="30" cy="0" r="12.5"/>
      <circle cx="-30" cy="34" r="12.5"/>
      <circle cx="30" cy="34" r="12.5"/>
    </g>
    <!-- Tiny Specular Highlights inside Pips -->
    <g fill="#6366F1" opacity="0.55">
      <circle cx="-33" cy="-37" r="3.5"/>
      <circle cx="27" cy="-37" r="3.5"/>
      <circle cx="-33" cy="-3" r="3.5"/>
      <circle cx="27" cy="-3" r="3.5"/>
      <circle cx="-33" cy="31" r="3.5"/>
      <circle cx="27" cy="31" r="3.5"/>
    </g>
  </g>

  <!-- Sparkle Glints -->
  <g fill="#FEF08A" filter="url(#softGlow)">
    <path d="M84 90 L88 102 L100 106 L88 110 L84 122 L80 110 L68 106 L80 102 Z"/>
    <path d="M424 108 L427 118 L437 121 L427 124 L424 134 L421 124 L411 121 L421 118 Z"/>
    <path d="M412 318 L415 326 L423 329 L415 332 L412 340 L409 332 L401 329 L409 326 Z"/>
  </g>

  <!-- Bottom Nameplate Banner for YAARI -->
  <g filter="url(#dropShadow)">
    <rect x="64" y="366" width="384" height="106" rx="34" fill="url(#ribbonGrad)" stroke="url(#goldFrame)" stroke-width="6"/>
    <rect x="74" y="374" width="364" height="90" rx="26" fill="none" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="2"/>
  </g>

  <!-- Bold 3D Gold YAARI Vector Typography -->
  <!-- Dark 3D Extrusion Layer -->
  <g transform="translate(0, 6)" fill="#451A03" stroke="#290F02" stroke-width="8" stroke-linejoin="round">
    ${yaariLetters}
  </g>
  <!-- Crisp Dark Outline -->
  <g fill="#78350F" stroke="#451A03" stroke-width="6" stroke-linejoin="round">
    ${yaariLetters}
  </g>
  <!-- Shiny Gold Gradient Fill -->
  <g fill="url(#goldText)">
    ${yaariLetters}
  </g>
</svg>`;
}

export async function generateGameIcons() {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const svgBuffer = Buffer.from(buildLudoYaariIconSvg());

  // 1. Export Amazon Appstore 512x512 & 114x114 icons
  const masterPngBuffer = await sharp(svgBuffer)
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toBuffer();

  const icon512Path = path.join(ARTIFACTS_DIR, 'LudoYaari-Icon-512.png');
  const icon114Path = path.join(ARTIFACTS_DIR, 'LudoYaari-Icon-114.png');
  await sharp(masterPngBuffer).toFile(icon512Path);
  await sharp(masterPngBuffer).resize(114, 114).png({ compressionLevel: 9 }).toFile(icon114Path);

  console.log(`Generated store icons:\n- ${icon512Path}\n- ${icon114Path}`);

  if (!fs.existsSync(RES_DIR)) {
    console.log('Android res directory not found yet; skipping mipmap overwrite.');
    return;
  }

  // 2. Remove adaptive XML overrides so custom PNG launcher icons show cleanly on all Android phones
  const anydpiDir = path.join(RES_DIR, 'mipmap-anydpi-v26');
  if (fs.existsSync(anydpiDir)) {
    fs.rmSync(anydpiDir, { recursive: true, force: true });
    console.log('Removed mipmap-anydpi-v26 adaptive XML overrides.');
  }

  // Prepare rounded-square and circular alpha masks at 512x512
  const squircleMask = Buffer.from(
    `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect x="16" y="16" width="480" height="480" rx="108" fill="#ffffff"/></svg>`
  );
  const circleMask = Buffer.from(
    `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><circle cx="256" cy="256" r="242" fill="#ffffff"/></svg>`
  );

  const squircleMaster = await sharp(masterPngBuffer)
    .composite([{ input: squircleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const roundMaster = await sharp(masterPngBuffer)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // 3. Overwrite all Android launcher mipmap densities
  const densities = [
    { folder: 'mipmap-mdpi', launcherSize: 48, foregroundSize: 108 },
    { folder: 'mipmap-hdpi', launcherSize: 72, foregroundSize: 162 },
    { folder: 'mipmap-xhdpi', launcherSize: 96, foregroundSize: 216 },
    { folder: 'mipmap-xxhdpi', launcherSize: 144, foregroundSize: 324 },
    { folder: 'mipmap-xxxhdpi', launcherSize: 192, foregroundSize: 432 },
  ];

  for (const { folder, launcherSize, foregroundSize } of densities) {
    const dir = path.join(RES_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });

    await sharp(squircleMaster)
      .resize(launcherSize, launcherSize)
      .png({ compressionLevel: 9 })
      .toFile(path.join(dir, 'ic_launcher.png'));

    await sharp(roundMaster)
      .resize(launcherSize, launcherSize)
      .png({ compressionLevel: 9 })
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    await sharp(masterPngBuffer)
      .resize(foregroundSize, foregroundSize)
      .png({ compressionLevel: 9 })
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  console.log('Replaced all Android mipmap launcher icons (mdpi through xxxhdpi).');
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

async function main() {
  console.log('Preparing clean Capacitor Android project for Ludo Yaari...');
  if (fs.existsSync(ANDROID_DIR)) {
    fs.rmSync(ANDROID_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(ARTIFACTS_DIR)) {
    fs.rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
  }

  run('npx cap add android');
  run('npx cap sync android');

  patchVariablesGradle();
  patchAndroidManifest();
  await generateGameIcons();
  generateKeystore();
  patchAppGradleSigning();

  console.log('\nAndroid project preparation complete.');
}

if (process.argv.includes('--icons-only')) {
  generateGameIcons().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
