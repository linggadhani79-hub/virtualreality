// Pengganti lokal "firebase/app": tidak ada koneksi ke server mana pun.
export function initializeApp(_config?: unknown) {
  return { name: "local" };
}
