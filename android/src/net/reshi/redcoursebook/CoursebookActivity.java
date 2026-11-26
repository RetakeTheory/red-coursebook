package net.reshi.redcoursebook;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;
import java.util.List;

public final class CoursebookActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private FrameLayout frame;
    private WebView book;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        frame = new FrameLayout(this);
        try {
            book = new WebView(this);
        } catch (RuntimeException unavailable) {
            showRendererSettings();
            return;
        }
        frame.addView(book);
        setContentView(frame);
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                    android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
            == Configuration.UI_MODE_NIGHT_YES;
        applyAppearance(dark);
        frame.requestApplyInsets();
        WebSettings settings = book.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= 29 && Build.VERSION.SDK_INT < 33) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        book.setWebViewClient(new BookClient());
        book.addJavascriptInterface(new Appearance(), "CoursebookAppearance");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        book.loadUrl("https://" + HOST + "/book/index.html?theme=" + (dark ? "dark" : "light"));
    }

    private void showRendererSettings() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(android.view.Gravity.CENTER_VERTICAL);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        panel.setPadding(padding, padding, padding, padding);
        TextView title = new TextView(this);
        title.setText("系统网页组件暂时不可用");
        title.setTextSize(22);
        TextView detail = new TextView(this);
        detail.setText("请在系统设置中启用网页组件，然后回到红课题本重试。");
        detail.setPadding(0, padding / 2, 0, padding);
        Button settings = new Button(this);
        settings.setText("打开应用设置");
        Intent apps = new Intent(android.provider.Settings.ACTION_APPLICATION_SETTINGS);
        settings.setOnClickListener(view -> startActivity(apps));
        Button retry = new Button(this);
        retry.setText("重试");
        retry.setOnClickListener(view -> recreate());
        panel.addView(title);
        panel.addView(detail);
        if (apps.resolveActivity(getPackageManager()) != null) panel.addView(settings);
        panel.addView(retry);
        setContentView(panel);
    }

    private void applyAppearance(boolean dark) {
        int surface = dark ? Color.rgb(28, 48, 70) : Color.WHITE;
        frame.setBackgroundColor(surface);
        book.setBackgroundColor(dark ? Color.rgb(20, 35, 54) : Color.rgb(243, 246, 250));
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) window.setNavigationBarContrastEnforced(false);
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        window.getDecorView().setSystemUiVisibility(flags);
    }

    private final class Appearance {
        @JavascriptInterface public void setDark(boolean dark) {
            runOnUiThread(() -> { if (!isDestroyed()) applyAppearance(dark); });
        }
    }

    private class BookClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return true;
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            List<String> path = uri.getPathSegments();
            if ("GET".equals(request.getMethod()) && "https".equals(uri.getScheme()) && HOST.equals(uri.getAuthority())
                    && path.size() == 2 && "book".equals(path.get(0)) && path.get(1).matches("[A-Za-z0-9_-]+[.][A-Za-z0-9]+")) {
                String name = path.get(1);
                try {
                    InputStream data = getAssets().open(name);
                    String type = mimeType(name);
                    return new WebResourceResponse(type, type.startsWith("image/") ? null : "UTF-8", data);
                } catch (IOException ignored) { /* Missing entries receive the same local 404. */ }
            }
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeType(String name) {
        if (name.endsWith(".html")) return "text/html";
        if (name.endsWith(".js")) return "application/javascript";
        if (name.endsWith(".json")) return "application/json";
        if (name.endsWith(".css")) return "text/css";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".jpg")) return "image/jpeg";
        if (name.endsWith(".png")) return "image/png";
        return "text/plain";
    }

    private void handleBack() {
        if (book == null) { finish(); return; }
        book.evaluateJavascript("typeof window.redbookBack === 'function' && window.redbookBack()", result -> {
            if (!"true".equals(result) && !isFinishing()) finish();
        });
    }
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onPause() { if (book != null) book.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (book != null) book.onResume(); }
    @Override protected void onDestroy() {
        if (book != null) {
            book.removeJavascriptInterface("CoursebookAppearance");
            frame.removeView(book);
            book.destroy();
        }
        super.onDestroy();
    }
}
