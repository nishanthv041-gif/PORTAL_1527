package com.srtuniversalschool.portal;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.CookieManager;
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
        WebView currentWebView = getBridge().getWebView();
        if (currentWebView != null) {
            currentWebView.setBackgroundColor(Color.parseColor("#060a28"));
            cookieManager.setAcceptThirdPartyCookies(currentWebView, true);
        }
        cookieManager.flush();

        // Handle Android hardware back navigation
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge().getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }
}
