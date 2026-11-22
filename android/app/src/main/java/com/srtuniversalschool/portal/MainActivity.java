package com.srtuniversalschool.portal;

import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Immediately switch from launch theme to application theme (eliminates hanging splash)
        setTheme(R.style.AppTheme_NoActionBar);
        super.onCreate(savedInstanceState);

        // Ensure third-party cookies and session persistence for NextAuth
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        setupSecureScreenBridge();
        cookieManager.flush();

        // Handle Android hardware back navigation
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    @Override
    public void onStart() {
        super.onStart();
        setupSecureScreenBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupSecureScreenBridge();
    }

    private void setupSecureScreenBridge() {
        if (getBridge() == null) return;
        final WebView currentWebView = getBridge().getWebView();
        if (currentWebView == null) return;

        currentWebView.setBackgroundColor(Color.parseColor("#060a28"));
        CookieManager.getInstance().setAcceptThirdPartyCookies(currentWebView, true);

        // Add JavaScript interface for dynamic screenshot restriction (Parent Portal only)
        currentWebView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setSecureMode(final boolean enabled) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (enabled) {
                            getWindow().setFlags(
                                WindowManager.LayoutParams.FLAG_SECURE,
                                WindowManager.LayoutParams.FLAG_SECURE
                            );
                        } else {
                            getWindow().clearFlags(
                                WindowManager.LayoutParams.FLAG_SECURE
                            );
                        }
                    }
                });
            }
        }, "AndroidSecureScreen");

        // Inspect current URL if already loaded on resume
        String url = currentWebView.getUrl();
        if (url != null && url.contains("/parent")) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    getWindow().setFlags(
                        WindowManager.LayoutParams.FLAG_SECURE,
                        WindowManager.LayoutParams.FLAG_SECURE
                    );
                }
            });
        }
    }
}
