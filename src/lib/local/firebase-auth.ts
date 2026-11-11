// Pengganti lokal "firebase/auth": tidak ada login; satu pengguna lokal di perangkat ini.
export type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
};

const localUser: User = {
  uid: "local-device",
  email: null,
  displayName: "Perangkat ini",
  photoURL: null,
  isAnonymous: true,
};

const authInstance = { currentUser: localUser as User | null };

export function getAuth(..._args: unknown[]) {
  return authInstance;
}

export function onAuthStateChanged(_auth: unknown, callback: (user: User | null) => void) {
  let active = true;
  Promise.resolve().then(() => {
    if (active) callback(localUser);
  });
  return () => {
    active = false;
  };
}

export async function signInAnonymously(_auth: unknown) {
  return { user: localUser };
}

export class GoogleAuthProvider {
  setCustomParameters(_params: Record<string, string>) {}
}

export async function signInWithPopup(_auth: unknown, _provider: unknown): Promise<{ user: User }> {
  const err: any = new Error("Mode lokal: login tidak diperlukan.");
  err.code = "auth/popup-closed-by-user";
  throw err;
}

export async function signOut(_auth: unknown) {}
