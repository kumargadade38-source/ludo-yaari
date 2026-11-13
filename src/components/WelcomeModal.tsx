import React, { useState } from 'react';
import { Dices, ArrowRight } from 'lucide-react';

interface WelcomeModalProps {
  initialName?: string;
  existingId?: string;
  isEditMode?: boolean;
  onSave: (name: string) => void;
  onCancel?: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  initialName = '',
  existingId,
  isEditMode = false,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Please enter at least 2 characters for your name.');
      return;
    }
    onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07051F]/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-gradient-to-b from-[#25216B] to-[#17144A] border border-indigo-300/30 shadow-[0_24px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.2)] p-6 sm:p-7 text-white">
        <div className="flex items-center gap-3.5 mb-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 text-stone-950 border border-amber-200 shadow-md flex items-center justify-center shrink-0">
            <Dices className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-white tracking-tight">
              {isEditMode ? 'Update Player Name' : 'Welcome to LUDO YAARI'}
            </h1>
            <p className="text-xs text-indigo-200/85">
              {isEditMode
                ? 'Your permanent 6-digit ID stays the same.'
                : 'No account needed. Enter your name to get your permanent ID.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-5">
          <div>
            <label
              htmlFor="player-name-input"
              className="block text-sm font-semibold text-indigo-100 mb-1.5"
            >
              Player Name
            </label>
            <input
              id="player-name-input"
              type="text"
              maxLength={18}
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Kumar, Maya, Sam"
              className="w-full h-12 px-4 rounded-xl border border-indigo-300/35 bg-[#100D38] text-white text-base font-semibold placeholder:text-indigo-300/50 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-colors"
            />
            {error && <p className="mt-1.5 text-xs font-semibold text-rose-300">{error}</p>}
          </div>

          {existingId && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#110E3B] border border-indigo-300/25">
              <span className="text-xs font-medium text-indigo-200">Permanent Player ID</span>
              <span className="font-mono-id text-base font-bold text-amber-300 tracking-wider">
                {existingId}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            {isEditMode && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 h-12 rounded-xl border border-indigo-300/30 bg-[#1B1754] text-indigo-100 text-sm font-bold hover:bg-[#231E69] active:scale-[0.98] transition-all cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="flex-1 h-12 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 border-b-4 border-amber-700 text-stone-950 text-sm font-extrabold flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-lg"
            >
              <span>{isEditMode ? 'Save Name' : 'Continue & Play'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
