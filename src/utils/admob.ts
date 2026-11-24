export function isNativeCapacitorApp(): boolean {
  return false;
}

export async function preloadInterstitialAd(): Promise<void> {}

export async function ensureAdMobInitialized(): Promise<boolean> {
  return true;
}

export async function initBannerAd(): Promise<void> {}

export async function hideBannerAd(): Promise<void> {}

export async function showBannerAd(): Promise<void> {}

export async function showInterstitialAd(): Promise<boolean> {
  try {
    const gpx = (window as any).GamePix;
    if (gpx && typeof gpx.interstitialAd === 'function') {
      await gpx.interstitialAd();
      return true;
    }
  } catch (e) {
    console.warn('GamePix interstitial failed', e);
  }
  return false;
}

export function registerAdMobGlobal(): void {
  if (typeof window === 'undefined') return;
  (window as any).showInterstitialAd = () => {
    void showInterstitialAd();
  };
  (window as any).showBannerAd = () => {};
}
