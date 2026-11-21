package com.llevalo.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

public class LlevaloMessagingService extends MessagingService {
    private static final String CHANNEL_ID = "driver-requests";
    private static final String ACTION_APPLY = "com.llevalo.app.NOTIFICATION_APPLY";
    private static final String ACTION_IGNORE = "com.llevalo.app.NOTIFICATION_IGNORE";
    private static final String EXTRA_ACTION = "notificationAction";
    private static final String EXTRA_ORDER_ID = "orderId";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        Map<String, String> data = message.getData();
        String kind = data.get("kind");
        if (!"driver_order".equals(kind) && !"driver_update".equals(kind)) return;

        int orderId;
        try {
            orderId = Integer.parseInt(data.get("orderId"));
        } catch (NumberFormatException | NullPointerException error) {
            return;
        }
        if (orderId < 1) return;

        long deadline = "driver_order".equals(kind) ? parseDeadline(data.get("deadline")) : 0;
        if ("driver_order".equals(kind) && deadline <= System.currentTimeMillis()) return;

        showNotification(data, kind, orderId, deadline);
    }

    private long parseDeadline(String value) {
        if (value == null) return 0;
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        try {
            Date deadline = format.parse(value);
            return deadline == null ? 0 : deadline.getTime();
        } catch (ParseException error) {
            return 0;
        }
    }

    private void showNotification(Map<String, String> data, String kind, int orderId, long deadline) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        ensureChannel();
        boolean isNewOrder = "driver_order".equals(kind);
        String title = data.get("title");
        if (title == null || title.isEmpty()) title = isNewOrder ? "Nuevo trabajo cerca" : "Aviso de Llévalo";

        String body = data.get("body");
        if (isNewOrder) {
            String service = "viajes".equals(data.get("serviceType")) ? "Viaje" : "Envío";
            body = service + " disponible · toca Postularme para responder.";
        }
        if (body == null || body.isEmpty()) body = "Abre Llévalo para revisar la actualización.";

        int notificationId = 1_000_000 + orderId;
        Intent openIntent = createAppIntent(orderId, "open");
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setColor(Color.rgb(255, 87, 34))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);

        if (isNewOrder) {
            long remaining = Math.max(0, deadline - System.currentTimeMillis());
            notification
                .setWhen(deadline)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setTimeoutAfter(remaining)
                .addAction(
                    android.R.drawable.ic_menu_send,
                    "Postularme",
                    createActionIntent(orderId, ACTION_APPLY, "apply")
                )
                .addAction(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "Ignorar",
                    createActionIntent(orderId, ACTION_IGNORE, "ignore")
                );
        }

        NotificationManagerCompat.from(this).notify(notificationId, notification.build());
    }

    private PendingIntent createActionIntent(int orderId, String action, String actionValue) {
        Intent intent = new Intent(this, NotificationActionReceiver.class)
            .setAction(action)
            .putExtra(EXTRA_ACTION, actionValue)
            .putExtra(EXTRA_ORDER_ID, orderId)
            .setData(Uri.parse("llevalo://notification/" + orderId + "/" + actionValue));
        int requestCode = orderId * 2 + ("apply".equals(actionValue) ? 1 : 0);
        return PendingIntent.getBroadcast(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private Intent createAppIntent(int orderId, String action) {
        return new Intent(this, MainActivity.class)
            .putExtra(EXTRA_ACTION, action)
            .putExtra(EXTRA_ORDER_ID, orderId)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        manager.createNotificationChannel(new NotificationChannel(
            CHANNEL_ID,
            "Solicitudes de trabajo",
            NotificationManager.IMPORTANCE_HIGH
        ));
    }
}
