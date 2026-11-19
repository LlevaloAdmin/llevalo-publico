package com.llevalo.app;

import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        aplicarEscalaDeTexto();
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
}
