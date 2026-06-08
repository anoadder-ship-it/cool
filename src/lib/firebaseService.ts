import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  increment,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import {
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  set,
  serverTimestamp as rtServerTimestamp,
  off,
} from "firebase/database";
import {
  getAuth,
  signInAnonymously,
  type User,
} from "firebase/auth";
import type { LeaderboardEntry } from "./leaderboardStore";

// ── Firebase init ─────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            "AIzaSyBPpCs76CVfeA8qjoW8DjpmRrxWsJk71l8",
  authDomain:        "burnbox-2217f.firebaseapp.com",
  projectId:         "burnbox-2217f",
  storageBucket:     "burnbox-2217f.firebasestorage.app",
  messagingSenderId: "88522013334",
  appId:             "1:88522013334:web:dc0c5133c7cd2a84fce0b7",
  measurementId:     "G-Q785L6F978",
  databaseURL:       "https://burnbox-2217f-default-rtdb.europe-west1.firebasedatabase.app",
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);

const COLLECTION       = "leaderboard";
const REFERRAL_COL     = "referrals";
const REFERRAL_USE_COL = "referral_uses";
const MAX_SIGS         = 20;

export const REFERRAL_CUT_PCT = 0.20;

// ── Anonymous Auth ────────────────────────────────────────────────────────────

let _authUser: User | null = null;

export async function ensureAnonymousAuth(): Promise<User> {
  if (_authUser) return _authUser;
  if (auth.currentUser) { _authUser = auth.currentUser; return _authUser; }
  const { user } = await signInAnonymously(auth);
  _authUser = user;
  return user;
}

// ── Internal Firestore document shape ─────────────────────────────────────────

interface FirestoreEntry {
  wallet:      string;
  walletShort: string;
  burned:      number;
  feeSol:      number;
  lastBurnAt:  Timestamp | null;
  signatures:  string[];
}

// ── Write a burn event ────────────────────────────────────────────────────────

export async function firestoreRecordBurns(
  walletAddress: string,
  count: number,
  feeSol: number,
  signatures: string[]
): Promise<void> {
  if (!walletAddress || count <= 0) return;
  const user        = await ensureAnonymousAuth();
  const walletShort = `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`;
  const docRef      = doc(db, COLLECTION, walletAddress);

  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data() as FirestoreEntry;
      const merged   = [...signatures, ...(existing.signatures ?? [])].slice(0, MAX_SIGS);
      await setDoc(docRef, {
        wallet: walletAddress, walletShort, uid: user.uid,
        burned: increment(count), feeSol: increment(feeSol),
        lastBurnAt: serverTimestamp(), signatures: merged,
      }, { merge: true });
    } else {
      await setDoc(docRef, {
        wallet: walletAddress, walletShort, uid: user.uid,
        burned: count, feeSol,
        lastBurnAt: serverTimestamp(), signatures: signatures.slice(0, MAX_SIGS),
      });
    }
  } catch (err) {
    console.error("[firebaseService] Failed to record burn:", err);
  }
}

// ── Global stats ──────────────────────────────────────────────────────────────

export interface GlobalStats {
  totalBurned:  number;
  totalWallets: number;
  totalFeeSol:  number;
}

// ── Real-time top-burners listener ────────────────────────────────────────────

export function subscribeTopBurners(
  topN: number,
  onUpdate: (entries: LeaderboardEntry[], stats: GlobalStats) => void
): Unsubscribe {
  const q = query(collection(db, COLLECTION), orderBy("burned", "desc"), limit(topN));

  return onSnapshot(q, (snapshot) => {
    const entries: LeaderboardEntry[] = snapshot.docs.map((d) => {
      const data = d.data() as FirestoreEntry;
      return {
        wallet:      data.wallet,
        walletShort: data.walletShort,
        burned:      data.burned ?? 0,
        feeSol:      data.feeSol ?? 0,
        lastBurnAt:  data.lastBurnAt instanceof Timestamp ? data.lastBurnAt.toMillis() : Date.now(),
        signatures:  data.signatures ?? [],
      };
    });

    const stats: GlobalStats = {
      totalBurned:  entries.reduce((s, e) => s + e.burned, 0),
      totalWallets: snapshot.size,
      totalFeeSol:  entries.reduce((s, e) => s + e.feeSol, 0),
    };

    onUpdate(entries, stats);
  }, (err) => {
    console.error("[firebaseService] Snapshot error:", err);
  });
}

// ── Personal wallet stats listener ───────────────────────────────────────────

export interface WalletStats {
  wallet:      string;
  walletShort: string;
  burned:      number;
  feeSol:      number;
  lastBurnAt:  number | null;
  signatures:  string[];
  rank:        number | null;
}

export function subscribeWalletStats(
  walletAddress: string,
  onUpdate: (stats: WalletStats | null) => void
): Unsubscribe {
  const docRef = doc(db, COLLECTION, walletAddress);

  return onSnapshot(docRef, async (snap) => {
    if (!snap.exists()) { onUpdate(null); return; }
    const data = snap.data() as FirestoreEntry;

    let rank: number | null = null;
    try {
      const q       = query(collection(db, COLLECTION), orderBy("burned", "desc"), limit(200));
      const rankSnap = await getDocs(q);
      const idx      = rankSnap.docs.findIndex((d) => d.id === walletAddress);
      rank = idx >= 0 ? idx + 1 : null;
    } catch (err) { console.warn("[firebaseService] Rank query failed:", err instanceof Error ? err.message : err); rank = null; }

    onUpdate({
      wallet:      data.wallet,
      walletShort: data.walletShort,
      burned:      data.burned  ?? 0,
      feeSol:      data.feeSol  ?? 0,
      lastBurnAt:  data.lastBurnAt instanceof Timestamp ? data.lastBurnAt.toMillis() : null,
      signatures:  data.signatures ?? [],
      rank,
    });
  }, (err) => {
    console.error("[firebaseService] WalletStats snapshot error:", err);
    onUpdate(null);
  });
}

// ── Presence (active users) ───────────────────────────────────────────────────

export function registerPresence(sessionId: string): () => void {
  const presenceRef = ref(rtdb, `presence/${sessionId}`);
  set(presenceRef, { online: true, lastSeen: rtServerTimestamp() });
  onDisconnect(presenceRef).remove();
  return () => {
    off(presenceRef);
    set(presenceRef, null);
  };
}

export function subscribeActiveUsers(onUpdate: (count: number) => void): () => void {
  const presenceRef = ref(rtdb, "presence");
  const handler = onValue(presenceRef, (snap) => {
    onUpdate(snap.exists() ? Object.keys(snap.val()).length : 0);
  });
  return () => off(presenceRef, "value", handler);
}

// ── Leaderboard seed helper ───────────────────────────────────────────────────

export async function seedLeaderboard(
  entries: Array<{ wallet: string; burned: number; feeSol: number }>
): Promise<void> {
  for (const e of entries) {
    const walletShort = `${e.wallet.slice(0, 4)}…${e.wallet.slice(-4)}`;
    await setDoc(doc(db, COLLECTION, e.wallet), {
      wallet: e.wallet, walletShort,
      burned: e.burned, feeSol: e.feeSol,
      lastBurnAt: serverTimestamp(), signatures: [],
    }, { merge: true });
  }
}

// ── Referral system ───────────────────────────────────────────────────────────

function walletToCode(wallet: string): string {
  const prefix = wallet.slice(0, 3).toUpperCase();
  const suffix = wallet.slice(-3).toUpperCase();
  const mid    = Math.abs(
    wallet.split("").reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 0)
  ) % 10000;
  return `${prefix}${mid.toString().padStart(4, "0")}${suffix}`;
}

export interface ReferralStats {
  code:          string;
  wallet:        string;
  totalEarned:   number;
  pendingPayout: number;
  totalRefs:     number;
  referrals:     ReferralUseEntry[];
}

export interface ReferralUseEntry {
  wallet: string;
  usedAt: number;
  burns:  number;
  earned: number;
}

export async function getOrCreateReferral(walletAddress: string): Promise<ReferralStats> {
  await ensureAnonymousAuth();
  const code   = walletToCode(walletAddress);
  const docRef = doc(db, REFERRAL_COL, walletAddress);
  const snap   = await getDoc(docRef);

  if (!snap.exists()) {
    await setDoc(docRef, {
      code, wallet: walletAddress,
      totalEarned: 0, pendingPayout: 0, totalRefs: 0,
      createdAt: serverTimestamp(),
    });
    return { code, wallet: walletAddress, totalEarned: 0, pendingPayout: 0, totalRefs: 0, referrals: [] };
  }

  const usesQ    = query(collection(db, REFERRAL_COL, walletAddress, "uses"), orderBy("usedAt", "desc"), limit(50));
  const usesSnap = await getDocs(usesQ);
  const referrals: ReferralUseEntry[] = usesSnap.docs.map((d) => {
    const u = d.data();
    return {
      wallet: u.wallet ?? d.id,
      usedAt: u.usedAt instanceof Timestamp ? u.usedAt.toMillis() : Date.now(),
      burns:  u.burns  ?? 0,
      earned: u.earned ?? 0,
    };
  });

  const data = snap.data();
  return {
    code:          data.code          ?? code,
    wallet:        data.wallet        ?? walletAddress,
    totalEarned:   data.totalEarned   ?? 0,
    pendingPayout: data.pendingPayout ?? 0,
    totalRefs:     data.totalRefs     ?? 0,
    referrals,
  };
}

export async function resolveReferralCode(code: string): Promise<string | null> {
  try {
    const q    = query(collection(db, REFERRAL_COL), where("code", "==", code), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].data().wallet ?? null;
  } catch (err) {
    console.error("[firebaseService] resolveReferralCode error:", err);
    return null;
  }
}

export async function registerReferralUse(
  referredWallet: string,
  referrerWallet: string
): Promise<void> {
  if (referredWallet === referrerWallet) return;
  try {
    await ensureAnonymousAuth();
    const useRef = doc(db, REFERRAL_USE_COL, referredWallet);
    const snap   = await getDoc(useRef);
    if (snap.exists()) return;

    await setDoc(useRef, {
      referrer: referrerWallet, usedAt: serverTimestamp(), burns: 0, earned: 0,
    });
    await setDoc(doc(db, REFERRAL_COL, referrerWallet), {
      totalRefs: increment(1),
    }, { merge: true });
  } catch (err) {
    console.error("[firebaseService] registerReferralUse error:", err);
  }
}

export async function creditReferralEarnings(
  burnerWallet: string,
  burnCount:    number,
  feeSolTotal:  number
): Promise<void> {
  try {
    await ensureAnonymousAuth();
    const useRef  = doc(db, REFERRAL_USE_COL, burnerWallet);
    const useSnap = await getDoc(useRef);
    if (!useSnap.exists()) return;

    const { referrer } = useSnap.data() as { referrer: string };
    if (!referrer) return;

    const earned = parseFloat((feeSolTotal * REFERRAL_CUT_PCT).toFixed(6));

    await setDoc(useRef, { burns: increment(burnCount), earned: increment(earned) }, { merge: true });
    await setDoc(doc(db, REFERRAL_COL, referrer), {
      totalEarned: increment(earned), pendingPayout: increment(earned),
    }, { merge: true });
    await setDoc(doc(db, REFERRAL_COL, referrer, "uses", burnerWallet), {
      wallet: burnerWallet, burns: increment(burnCount), earned: increment(earned), usedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error("[firebaseService] creditReferralEarnings error:", err);
  }
}

export function subscribeReferralStats(
  walletAddress: string,
  onUpdate: (stats: ReferralStats | null) => void
): Unsubscribe {
  const docRef = doc(db, REFERRAL_COL, walletAddress);

  return onSnapshot(docRef, async (snap) => {
    if (!snap.exists()) { onUpdate(null); return; }
    const data = snap.data();

    try {
      const usesQ    = query(collection(db, REFERRAL_COL, walletAddress, "uses"), orderBy("usedAt", "desc"), limit(50));
      const usesSnap = await getDocs(usesQ);
      const referrals: ReferralUseEntry[] = usesSnap.docs.map((d) => {
        const u = d.data();
        return {
          wallet: u.wallet ?? d.id,
          usedAt: u.usedAt instanceof Timestamp ? u.usedAt.toMillis() : Date.now(),
          burns:  u.burns  ?? 0,
          earned: u.earned ?? 0,
        };
      });

      onUpdate({
        code:          data.code          ?? walletToCode(walletAddress),
        wallet:        data.wallet        ?? walletAddress,
        totalEarned:   data.totalEarned   ?? 0,
        pendingPayout: data.pendingPayout ?? 0,
        totalRefs:     data.totalRefs     ?? 0,
        referrals,
      });
    } catch (err) {
      console.warn("[firebaseService] Failed to fetch referral uses:", err instanceof Error ? err.message : err);
      onUpdate(null);
    }
  }, (err) => {
    console.error("[firebaseService] subscribeReferralStats error:", err);
    onUpdate(null);
  });
}
