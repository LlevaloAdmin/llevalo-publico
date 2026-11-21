package com.llevalo.app;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
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
                    mostrarPantallaOffline(view, request.getUrl());
                    return;
                }
                super.onReceivedError(view, request, error);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                if (request.isForMainFrame()) {
                    mostrarPantallaOffline(view, request.getUrl());
                    return;
                }
                super.onReceivedHttpError(view, request, errorResponse);
            }
        });
        if (!hayInternetValidado()) {
            String offlineUrl = crearUrlOffline();
            webView.stopLoading();
            webView.loadUrl(offlineUrl);
        } else {
            abrirAccionNotificacion(getIntent());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        abrirAccionNotificacion(intent);
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
        if ("llevalo".equals(uri.getScheme()) && "location-settings".equals(uri.getHost())) {
            Intent settings = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", getPackageName(), null));
            startActivity(settings);
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

    private void abrirAccionNotificacion(Intent intent) {
        if (intent == null || !intent.hasExtra("notificationAction")) return;
        String action = intent.getStringExtra("notificationAction");
        int orderId = intent.getIntExtra("orderId", 0);
        if (orderId < 1 || (!"apply".equals(action) && !"open".equals(action))) return;

        Uri url = Uri.parse("https://llevalo.vercel.app/")
            .buildUpon()
            .appendQueryParameter("notificationAction", action)
            .appendQueryParameter("orderId", String.valueOf(orderId))
            .build();
        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url.toString()));
        intent.removeExtra("notificationAction");
        intent.removeExtra("orderId");
    }

    private void mostrarPantallaOffline(WebView view, Uri failedUrl) {
        if (failedUrl.toString().startsWith(OFFLINE_ASSET_URL)) return;

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
