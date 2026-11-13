import React, { useEffect } from 'react';
import {
  ADMOB_BANNER_AD_UNIT_ID,
  hideBannerAd,
  initBannerAd,
  isNativeCapacitorApp,
} from '../utils/admob';

export const AdMobBanner: React.FC = () => {
  const isNative = isNativeCapacitorApp();

  useEffect(() => {
    void initBannerAd();
    return () => {
      void hideBannerAd();
    };
  }, []);

  return (
    <aside
      aria-label="Advertisement banner space"
      data-admob-banner-id={ADMOB_BANNER_AD_UNIT_ID}
      className="fixed bottom-0 left-0 right-0 z-40 h-[60px] bg-[#0B0826]/95 backdrop-blur-md border-t border-indigo-400/20 flex items-center justify-center px-4"
    >
      <div
        id="admob-banner-space"
        className={`w-full max-w-[468px] h-[50px] rounded-lg flex items-center justify-center text-xs font-medium select-none ${
          isNative
            ? 'bg-transparent text-transparent'
            : 'border border-dashed border-indigo-300/25 bg-[#151243]/80 text-indigo-200/60'
        }`}
      >
        {isNative ? '' : 'AdMob Banner Space (320×50 / 60px Reserved)'}
      </div>
    </aside>
  );
};
