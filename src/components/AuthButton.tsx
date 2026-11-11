import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { auth, signInWithGoogle, logout } from '../lib/firebase';
import { LogIn, LogOut, User as UserIcon, AlertTriangle, X } from 'lucide-react';

export function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (errorNotice) {
      const timer = setTimeout(() => {
        setErrorNotice(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [errorNotice]);

  const handleLogin = async () => {
    setErrorNotice(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      console.error("Login component caught error:", e);
      if (e.code === 'auth/popup-closed-by-user') {
        console.log("Login popup closed by user.");
      } else if (e.code === 'auth/operation-not-supported-in-this-environment') {
        setErrorNotice("Sign-in Google tidak didukung di frame sandbox ini. Pastikan domain ter-whitelist di Firebase Auth.");
      } else if (e.code === 'auth/popup-blocked') {
        setErrorNotice("Popup login diblokir oleh browser Anda. Harap izinkan popup untuk situs ini.");
      } else if (e.code === 'auth/admin-restricted-operation') {
        setErrorNotice("Gagal login. Pastikan domain ini terdaftar di 'Authorized domains' dan 'Enable client authentication' diaktifkan di Firebase Console (Authentication -> Settings).");
      } else {
        setErrorNotice(`Gagal Login: ${e.message || "Kesalahan tidak dikenal"}`);
      }
    }
  };

  const handleLogout = () => {
    setErrorNotice(null);
    logout();
  };

  return (
    <div className="flex flex-col items-end gap-2 pointer-events-auto">
      {/* Non-blocking error toast */}
      {errorNotice && (
        <div className="flex items-center gap-2 bg-red-500/90 text-white text-[11px] font-semibold px-3 py-2 rounded-lg shadow-xl max-w-xs border border-red-400 animate-in fade-in slide-in-from-top duration-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{errorNotice}</span>
          <button 
            onClick={() => setErrorNotice(null)}
            className="hover:bg-white/20 p-0.5 rounded cursor-pointer shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {isAuthChecking ? (
        <div className="flex items-center justify-center bg-gray-900/50 backdrop-blur px-3 py-2 rounded-full border border-white/10 shadow-lg">
          <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin mr-2" />
          <span className="text-white/70 text-xs font-medium">Checking auth...</span>
        </div>
      ) : user && !user.isAnonymous ? (
        <div className="flex items-center gap-3 bg-gray-900/50 backdrop-blur pl-3 pr-2 py-1.5 rounded-full border border-white/10 shadow-lg">
          {user.photoURL ? (
            <img src={user.photoURL} alt="Profile" className="w-6 h-6 rounded-full border border-white/20" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-indigo-500/30 flex items-center justify-center border border-indigo-400">
               <UserIcon className="w-3.5 h-3.5 text-indigo-200" />
            </div>
          )}
          <span className="text-white/90 text-[13px] font-medium max-w-[100px] truncate">
            {user.displayName || user.email}
          </span>
          <button
            onClick={handleLogout}
            className="bg-white/10 hover:bg-red-500/40 text-red-100 p-1.5 rounded-full transition-all duration-200 ml-1 cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={handleLogin}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-full font-medium transition-all duration-200 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:shadow-[0_0_20px_rgba(99,102,241,0.6)] text-[13px] cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>Sign In with Google</span>
        </button>
      )}
    </div>
  );
}
