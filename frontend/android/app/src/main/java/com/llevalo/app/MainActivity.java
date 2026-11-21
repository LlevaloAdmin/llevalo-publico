package com.llevalo.app;

import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        aplicarEscalaDeTexto();
        getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return manejarNavegacion(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return manejarNavegacion(Uri.parse(url));
            }
        });
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        aplicarEscalaDeTexto();
    }

    private void aplicarEscalaDeTexto() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            float escalaTexto = getResources().getConfiguration().fontScale;
            getBridge().getWebView().getSettings().setTextZoom(Math.round(escalaTexto * 100));
        }
    }

    private boolean manejarNavegacion(Uri uri) {
        if ("llevalo".equals(uri.getScheme()) && "exit".equals(uri.getHost())) {
            finish();
            return true;
        }
        return getBridge().launchIntent(uri);
    }
}
