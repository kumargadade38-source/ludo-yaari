import { ActiveOnlineSession, FriendEntry, PlayerProfile } from '../types/ludo';

const PROFILE_KEY = 'ludo_pocket_profile_v1';
const FRIENDS_KEY = 'ludo_pocket_friends_v1';
const MUTE_KEY = 'ludo_pocket_muted_v1';
const ACTIVE_SESSION_KEY = 'ludo_pocket_active_match_v1';

export function generateSixDigitId(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return String(num);
}

export function isValidSixDigitId(id: string): boolean {
  return /^\d{6}$/.test(id.trim());
}

export function loadPlayerProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayerProfile;
    if (parsed && isValidSixDigitId(parsed.id) && typeof parsed.name === 'string' && parsed.name.trim()) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function savePlayerProfile(name: string, existingId?: string): PlayerProfile {
  const existing = loadPlayerProfile();
  const id = existing?.id || (existingId && isValidSixDigitId(existingId) ? existingId : generateSixDigitId());
  const profile: PlayerProfile = {
    id,
    name: name.trim().slice(0, 18) || 'Player',
    createdAt: existing?.createdAt || Date.now(),
  };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

export function loadFriendsList(): FriendEntry[] {
  try {
    const raw = localStorage.getItem(FRIENDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is FriendEntry =>
        f && typeof f.id === 'string' && isValidSixDigitId(f.id) && typeof f.nickname === 'string'
    );
  } catch {
    return [];
  }
}

export function saveFriendsList(friends: FriendEntry[]): void {
  localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends));
}

export function addOrUpdateFriend(id: string, nickname: string): FriendEntry[] {
  const cleanId = id.trim();
  const cleanNick = nickname.trim().slice(0, 20);
  if (!isValidSixDigitId(cleanId) || !cleanNick) {
    return loadFriendsList();
  }
  const current = loadFriendsList();
  const idx = current.findIndex((f) => f.id === cleanId);
  if (idx >= 0) {
    current[idx] = { ...current[idx], nickname: cleanNick };
  } else {
    current.unshift({ id: cleanId, nickname: cleanNick, addedAt: Date.now() });
  }
  saveFriendsList(current);
  return current;
}

export function removeFriend(id: string): FriendEntry[] {
  const updated = loadFriendsList().filter((f) => f.id !== id);
  saveFriendsList(updated);
  return updated;
}

export function loadMutedPreference(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMutedPreference(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}

export function saveActiveOnlineSession(session: ActiveOnlineSession): void {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function loadActiveOnlineSession(playerId?: string): ActiveOnlineSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveOnlineSession;
    if (
      !parsed ||
      !isValidSixDigitId(parsed.hostId) ||
      !isValidSixDigitId(parsed.playerId) ||
      typeof parsed.seatIndex !== 'number'
    ) {
      return null;
    }
    if (playerId && parsed.playerId !== playerId) {
      return null;
    }
    // Expire stale sessions older than 2 hours
    if (Date.now() - parsed.startedAt > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveOnlineSession(): void {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}

export function clearAllLocalData(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(FRIENDS_KEY);
    localStorage.removeItem(MUTE_KEY);
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}

