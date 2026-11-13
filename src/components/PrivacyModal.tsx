import React, { useState } from 'react';
import { HardDrive, Mic, MonitorPlay, ShieldCheck, Trash2, X } from 'lucide-react';

interface PrivacyModalProps {
  onClose: () => void;
  onResetData: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ onClose, onResetData }) => {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#07051F]/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-gradient-to-b from-[#25216B] to-[#17144A] border border-indigo-300/30 shadow-2xl overflow-hidden text-white">
        <div className="flex items-center justify-between px-5 py-4 border-b border-indigo-300/20 bg-[#1B1754]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-sky-400 to-indigo-600 border border-sky-200/60 flex items-center justify-center shadow">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="privacy-modal-title" className="font-display text-base sm:text-lg font-extrabold leading-tight">
                Privacy &amp; App Info
              </h2>
              <p className="text-[11px] text-indigo-200/75">
                LUDO YAARI · Data &amp; Permission Summary
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Privacy & Info modal"
            className="w-9 h-9 rounded-xl border border-indigo-300/25 bg-[#161248] hover:bg-[#231E69] text-indigo-100 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 max-h-[75dvh] overflow-y-auto text-sm">
          <div className="rounded-xl bg-[#120F3F]/85 border border-indigo-300/20 p-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
              <Mic className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                Microphone &amp; Voice Chat
              </h3>
              <p className="text-xs text-indigo-100/90 leading-relaxed">
                Microphone audio is strictly used only when you turn on the Mic button for live Peer-to-Peer voice chat during online matches. Voice audio is streamed directly between players and is never recorded, uploaded, or stored on any server.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[#120F3F]/85 border border-indigo-300/20 p-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/35 text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <HardDrive className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                Local Device Storage
              </h3>
              <p className="text-xs text-indigo-100/90 leading-relaxed">
                Your Player Name, 6-digit Player ID, Saved Friends list, sound preference, and active match rejoin session are stored solely on your own device using local storage. No account registration or remote profile database is used.
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[#120F3F]/85 border border-indigo-300/20 p-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/35 text-sky-300 flex items-center justify-center shrink-0 mt-0.5">
              <MonitorPlay className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-300">
                Advertising (Google AdMob)
              </h3>
              <p className="text-xs text-indigo-100/90 leading-relaxed">
                LUDO YAARI uses Google AdMob to display a bottom banner ad and post-match interstitial ads to keep the game free to play.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-indigo-300/20 space-y-2.5">
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="w-full h-11 rounded-xl border border-rose-400/45 bg-rose-950/60 hover:bg-rose-900/75 text-rose-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Trash2 className="w-4 h-4 text-rose-300" />
                <span>Reset My Data / Delete Local Data</span>
              </button>
            ) : (
              <div className="rounded-xl border border-rose-400/50 bg-rose-950/80 p-3 space-y-2.5">
                <p className="text-xs font-semibold text-rose-100 text-center">
                  Delete your Player Name, 6-digit ID, and Saved Friends from this device?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="flex-1 h-10 rounded-lg border border-indigo-300/30 bg-[#1B1754] hover:bg-[#231E69] text-indigo-100 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onResetData}
                    className="flex-1 h-10 rounded-lg bg-gradient-to-b from-rose-500 to-rose-700 border-b-2 border-rose-900 text-white text-xs font-extrabold hover:brightness-105 cursor-pointer"
                  >
                    Yes, Delete Data
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
