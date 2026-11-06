package com.quitsmoke.app;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

public class StandaloneReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String reminderJson = intent.getStringExtra("reminder_json");
        if (reminderJson == null) return;
        try {
            deliverScheduled(context, new JSONObject(reminderJson));
        } catch (Exception error) {
            return;
        }
    }

    public static void deliverScheduled(Context context, JSONObject item) {
        String id = item.optString("id", "reminder");
        String title = item.optString("title", "提醒时间到了");
        showNotification(context, id, title, "补 · 提醒时间到了", true, item.optString("mode"));
        StandaloneReminderScheduler.continueRecurring(context, item.toString());
    }

    public static boolean showNotification(
            Context context,
            String id,
            String title,
            String body,
            boolean openReminderPage,
            String reminderMode) {
        if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) return false;
        StandaloneReminderScheduler.ensureChannel(context);
        int notificationId = StandaloneReminderScheduler.requestCode(id);

        Intent openIntent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (openReminderPage) openIntent.putExtra("open_page", "reminder");
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent confirmIntent = new Intent(context, NotificationActionReceiver.class)
            .putExtra("notification_id", notificationId)
            .putExtra("reminder_confirm_id", id)
            .putExtra("reminder_confirm_mode", reminderMode);
        PendingIntent confirmAction = PendingIntent.getBroadcast(
            context,
            notificationId ^ 0x434F,
            confirmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent snoozeIntent = new Intent(context, NotificationActionReceiver.class)
            .putExtra("notification_action", "snooze")
            .putExtra("notification_id", notificationId)
            .putExtra("snooze_type", "standalone")
            .putExtra("snooze_id", id)
            .putExtra("snooze_title", title)
            .putExtra("snooze_minutes", 10);
        PendingIntent snoozeAction = PendingIntent.getBroadcast(
            context,
            notificationId ^ 0x534E,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(
            context, StandaloneReminderScheduler.CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .addAction(0, "确认", confirmAction)
            .addAction(0, "稍后", snoozeAction)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);
        manager.notify(notificationId, notification.build());
        return true;
    }
}
