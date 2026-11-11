package id.smartvocational.evlab;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;

/**
 * Membuka aplikasi web Smart Vocational EV sebagai Trusted Web Activity.
 * Di Meta Quest, sistem membukanya di jendela PWA (Meta Quest Browser) yang mendukung WebXR;
 * di HP Android dibuka oleh Chrome dalam mode layar penuh.
 */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Mengunci orientasi pada tema transparan membuat aplikasi crash di Android 8.0 ke bawah.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }
}
