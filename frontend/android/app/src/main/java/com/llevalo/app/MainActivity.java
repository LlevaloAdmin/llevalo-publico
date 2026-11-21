package com.llevalo.app;

import android.content.Context;
import android.content.res.Configuration;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String OFFLINE_ASSET_URL = "file:///android_asset/public/offline.html";
    private static final String CLAVE_MODO_OSCURO = "dark_mode";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        aplicarEscalaDeTexto();
        WebView webView = getBridge().getWebView();
        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return manejarNavegacion(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return manejarNavegacion(Uri.parse(url));
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    mostrarPantallaOffline(view);
                    return;
                }
                super.onReceivedError(view, request, error);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request.isForMainFrame()) {
                    mostrarPantallaOffline(view);
                    return;
                }
                super.onReceivedHttpError(view, request, errorResponse);
            }
        });
        if (!hayInternetValidado()) {
            String offlineUrl = crearUrlOffline();
            webView.stopLoading();
            webView.loadUrl(offlineUrl);
        }
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
        if ("llevalo".equals(uri.getScheme()) && "theme".equals(uri.getHost())) {
            String mode = uri.getLastPathSegment();
            if ("dark".equals(mode) || "light".equals(mode)) {
                getPreferences(Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(CLAVE_MODO_OSCURO, "dark".equals(mode))
                    .apply();
            }
            return true;
        }
        return getBridge().launchIntent(uri);
    }

    private void mostrarPantallaOffline(WebView view) {
        String currentUrl = view.getUrl();
        if (currentUrl != null && currentUrl.startsWith(OFFLINE_ASSET_URL)) return;

        String offlineUrl = crearUrlOffline();
        view.stopLoading();
        view.loadUrl(offlineUrl);
    }

    private String crearUrlOffline() {
        boolean darkMode = getPreferences(Context.MODE_PRIVATE)
            .getBoolean(CLAVE_MODO_OSCURO, modoOscuroDelDispositivo());
        return Uri.parse(OFFLINE_ASSET_URL)
            .buildUpon()
            .appendQueryParameter("theme", darkMode ? "dark" : "light")
            .build()
            .toString();
    }

    private boolean modoOscuroDelDispositivo() {
        int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    private boolean hayInternetValidado() {
        ConnectivityManager connectivityManager =
            (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return false;

        Network network = connectivityManager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null
            ? null
            : connectivityManager.getNetworkCapabilities(network);
        return capabilities != null
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
}
