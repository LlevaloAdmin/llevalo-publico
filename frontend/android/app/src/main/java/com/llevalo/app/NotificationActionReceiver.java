package com.llevalo.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationManagerCompat;

public class NotificationActionReceiver extends BroadcastReceiver {
    private static final String EXTRA_ACTION = "notificationAction";
    private static final String EXTRA_ORDER_ID = "orderId";

    @Override
    public void onReceive(Context context, Intent intent) {
        int orderId = intent.getIntExtra(EXTRA_ORDER_ID, 0);
        String action = intent.getStringExtra(EXTRA_ACTION);
        if (orderId < 1 || action == null) return;

        NotificationManagerCompat.from(context).cancel(1_000_000 + orderId);
        if (!"apply".equals(action)) return;

        Intent appIntent = new Intent(context, MainActivity.class)
            .putExtra(EXTRA_ACTION, action)
            .putExtra(EXTRA_ORDER_ID, orderId)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(appIntent);
    }
}
