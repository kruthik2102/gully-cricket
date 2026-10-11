package io.github.kruthik2102.gullycricket;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** Gully Cricket: an offline WebView shell around the single-page scorer in assets/www. */
public class MainActivity extends AppCompatActivity {
    private static final String START_URL = "file:///android_asset/www/index.html";
    private static final int BG_DARK = 0xFF0A0D13;
    private static final int BG_LIGHT = 0xFFE6EBF2;

    private FrameLayout root;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private ActivityResultLauncher<Intent> filePicker;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        filePicker = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (fileCallback == null) return;
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData()));
            fileCallback = null;
        });

        // Scoring happens with the phone in hand: keep the screen on while the app is open.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyBars(isSystemDark());

        // Draw edge to edge, but pad the page clear of the status bar, navigation bar, notch and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setBackgroundColor(isSystemDark() ? BG_DARK : BG_LIGHT);
        web.addJavascriptInterface(new Bridge(), "GullyNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // no app to open the link
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    filePicker.launch(params.createIntent());
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });

        // Hardware / gesture back: let the page step back first; close the app from the home screen.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript("(window.GullyApp && window.GullyApp.back) ? window.GullyApp.back() : false", value -> {
                    if (!"true".equals(value)) {
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        });

        web.loadUrl(START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("GullyNative");
            web.destroy();
        }
        super.onDestroy();
    }

    private boolean isSystemDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private void applyBars(boolean dark) {
        root.setBackgroundColor(dark ? BG_DARK : BG_LIGHT);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }

    private static String safeName(String name, String fallback) {
        String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return n.isEmpty() ? fallback : n;
    }

    private void shareBytes(byte[] bytes, String filename, String mime, String text) throws Exception {
        File dir = new File(getCacheDir(), "shared");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("cache folder unavailable");
        File f = new File(dir, filename);
        try (FileOutputStream os = new FileOutputStream(f)) {
            os.write(bytes);
        }
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
        send.setClipData(ClipData.newRawUri("", uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, null);
        runOnUiThread(() -> startActivity(chooser));
    }

    /** Exposed to the page as window.GullyNative. Methods run on a background thread. */
    public class Bridge {
        @JavascriptInterface
        public String saveFile(String base64, String filename, String mime) {
            String name = safeName(filename, "gully-cricket");
            String type = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    boolean image = type.startsWith("image/");
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, type);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH,
                            (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/GullyCricket");
                    Uri collection = image
                            ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                            : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    Uri item = getContentResolver().insert(collection, values);
                    if (item == null) return "error";
                    try (OutputStream os = getContentResolver().openOutputStream(item)) {
                        if (os == null) return "error";
                        os.write(bytes);
                    }
                    return "saved";
                }
                // Android 8-9 have no scoped storage: hand the file to the share sheet instead.
                shareBytes(bytes, name, type, null);
                return "shared";
            } catch (Exception e) {
                return "error";
            }
        }

        @JavascriptInterface
        public String shareFile(String base64, String filename, String mime, String text) {
            try {
                shareBytes(Base64.decode(base64, Base64.DEFAULT), safeName(filename, "gully-cricket.png"),
                        (mime == null || mime.isEmpty()) ? "image/png" : mime, text);
                return "ok";
            } catch (Exception e) {
                return "error";
            }
        }

        @JavascriptInterface
        public String shareText(String text) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            Intent chooser = Intent.createChooser(send, null);
            runOnUiThread(() -> startActivity(chooser));
            return "ok";
        }

        @JavascriptInterface
        public String copyText(String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Gully Cricket", text));
            });
            return "ok";
        }

        @JavascriptInterface
        public void setDark(boolean dark) {
            runOnUiThread(() -> applyBars(dark));
        }
    }
}
