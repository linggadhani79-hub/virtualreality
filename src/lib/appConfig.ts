/**
 * MODE UJI COBA TANPA LOGIN
 *
 * true  : Mode Admin dan Mode Mahasiswa langsung terbuka tanpa kode akses / login Google.
 * false : perilaku semula — mahasiswa memakai kode akses, admin login dengan akun Google admin.
 *
 * Catatan: ini hanya membuka tampilan admin di aplikasi. Penyimpanan ke cloud (Firebase) tetap
 * mengikuti aturan keamanan Firebase, jadi tanpa login admin perubahan map bisa saja tidak
 * tersimpan ke cloud. Kembalikan ke false sebelum aplikasi dipakai umum.
 */
export const TRIAL_NO_AUTH = true;

/** Batas waktu menunggu data cloud; lewat dari ini aplikasi memakai data yang tersimpan di perangkat. */
export const CLOUD_TIMEOUT_MS = 4000;
