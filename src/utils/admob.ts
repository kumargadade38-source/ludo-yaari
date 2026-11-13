import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
} from '@capacitor-community/admob';

export const ADMOB_APP_ID = 'ca-app-pub-8592915239178695~4656930184';
export const ADMOB_BANNER_AD_UNIT_ID = 'ca-app-pub-8592915239178695/8508370279';
export const ADMOB_INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-8592915239178695/5973881289';

export interface AdMobWindow extends Window {
  showInterstitialAd?: () => void;
  showBannerAd?: () => void;
  AndroidAdMob?: {
    showBanner?: (adUnitId?: string) => void;
    hideBanner?: () => void;
    showInterstitial?: (adUnitId?: string) => void;
    showInterstitialAd?: (adUnitId?: string) => void;
  };
  AndroidBridge?: {
    showBanner?: (adUnitId?: string) => void;
    hideBanner?: () => void;
    showInterstitialAd?: (adUnitId?: string) => void;
  };
  AdMob?: {
    showBanner?: (adUnitId?: string) => void;
    hideBanner?: () => void;
    showInterstitial?: (adUnitId?: string) => void;
  };
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      AdMob?: {
        initialize?: (options?: Record<string, unknown>) => Promise<void> | void;
        showBanner?: (options?: Record<string, unknown>) => Promise<void> | void;
        hideBanner?: () => Promise<void> | void;
        prepareInterstitial?: (options?: Record<string, unknown>) => Promise<void> | void;
        showInterstitial?: () => Promise<void> | void;
      };
    };
  };
  __onInterstitialTriggered?: () => void;
}

let initPromise: Promise<boolean> | null = null;
let listenersRegistered = false;
let interstitialReady = false;
let interstitialPreparing = false;
let bannerVisible = false;

export function isNativeCapacitorApp(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function preloadInterstitialAd(): Promise<void> {
  if (!isNativeCapacitorApp() || interstitialReady || interstitialPreparing) {
    return;
  }
  interstitialPreparing = true;
  try {
    await AdMob.prepareInterstitial({
      adId: ADMOB_INTERSTITIAL_AD_UNIT_ID,
      isTesting: false,
    });
    interstitialReady = true;
  } catch {
    interstitialReady = false;
  } finally {
    interstitialPreparing = false;
  }
}

export async function ensureAdMobInitialized(): Promise<boolean> {
  if (!isNativeCapacitorApp()) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await AdMob.initialize({
        initializeForTesting: false,
      });

      if (!listenersRegistered) {
        listenersRegistered = true;
        AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
          interstitialReady = true;
        }).catch(() => {});

        AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
          interstitialReady = false;
        }).catch(() => {});

        AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
          interstitialReady = false;
          void preloadInterstitialAd();
        }).catch(() => {});

        AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
          interstitialReady = false;
          void preloadInterstitialAd();
        }).catch(() => {});
      }

      void preloadInterstitialAd();
      return true;
    } catch {
      initPromise = null;
      return false;
    }
  })();

  return initPromise;
}

export async function initBannerAd(): Promise<void> {
  if (typeof window === 'undefined') return;
  const win = window as AdMobWindow;

  try {
    if (isNativeCapacitorApp()) {
      const ok = await ensureAdMobInitialized();
      if (!ok || bannerVisible) return;
      await AdMob.showBanner({
        adId: ADMOB_BANNER_AD_UNIT_ID,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
        margin: 0,
        isTesting: false,
      });
      bannerVisible = true;
      return;
    }

    if (win.AndroidAdMob && typeof win.AndroidAdMob.showBanner === 'function') {
      win.AndroidAdMob.showBanner(ADMOB_BANNER_AD_UNIT_ID);
    } else if (win.AndroidBridge && typeof win.AndroidBridge.showBanner === 'function') {
      win.AndroidBridge.showBanner(ADMOB_BANNER_AD_UNIT_ID);
    } else if (win.AdMob && typeof win.AdMob.showBanner === 'function') {
      win.AdMob.showBanner(ADMOB_BANNER_AD_UNIT_ID);
    }
  } catch {
    // Fail silently in web preview environments without native AdMob bridge
  }
}

export async function hideBannerAd(): Promise<void> {
  if (typeof window === 'undefined') return;
  const win = window as AdMobWindow;

  try {
    if (isNativeCapacitorApp()) {
      if (!bannerVisible) return;
      await AdMob.hideBanner();
      bannerVisible = false;
      return;
    }

    if (win.AndroidAdMob && typeof win.AndroidAdMob.hideBanner === 'function') {
      win.AndroidAdMob.hideBanner();
    } else if (win.AndroidBridge && typeof win.AndroidBridge.hideBanner === 'function') {
      win.AndroidBridge.hideBanner();
    } else if (win.AdMob && typeof win.AdMob.hideBanner === 'function') {
      win.AdMob.hideBanner();
    }
  } catch {
    // Fail silently in web preview environments without native AdMob bridge
  }
}

export function showInterstitialAd(): void {
  if (typeof window === 'undefined') return;
  const win = window as AdMobWindow;

  try {
    if (isNativeCapacitorApp()) {
      void (async () => {
        try {
          const ok = await ensureAdMobInitialized();
          if (!ok) return;
          if (!interstitialReady) {
            await preloadInterstitialAd();
          }
          if (interstitialReady) {
            interstitialReady = false;
            await AdMob.showInterstitial();
          }
        } catch {
          interstitialReady = false;
          void preloadInterstitialAd();
        }
      })();
    } else if (win.AndroidAdMob && typeof win.AndroidAdMob.showInterstitialAd === 'function') {
      win.AndroidAdMob.showInterstitialAd(ADMOB_INTERSTITIAL_AD_UNIT_ID);
    } else if (win.AndroidAdMob && typeof win.AndroidAdMob.showInterstitial === 'function') {
      win.AndroidAdMob.showInterstitial(ADMOB_INTERSTITIAL_AD_UNIT_ID);
    } else if (win.AndroidBridge && typeof win.AndroidBridge.showInterstitialAd === 'function') {
      win.AndroidBridge.showInterstitialAd(ADMOB_INTERSTITIAL_AD_UNIT_ID);
    } else if (win.AdMob && typeof win.AdMob.showInterstitial === 'function') {
      win.AdMob.showInterstitial(ADMOB_INTERSTITIAL_AD_UNIT_ID);
    }
  } catch {
    // Fail silently in browser environments without native bridge
  }

  if (typeof win.__onInterstitialTriggered === 'function') {
    win.__onInterstitialTriggered();
  }
}

export function registerAdMobGlobal(): void {
  if (typeof window !== 'undefined') {
    const win = window as AdMobWindow;
    win.showInterstitialAd = showInterstitialAd;
    win.showBannerAd = () => {
      void initBannerAd();
    };
    if (isNativeCapacitorApp()) {
      void ensureAdMobInitialized();
    }
  }
}
