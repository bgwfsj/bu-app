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

public class SnoozeReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) return;

        String type = intent.getStringExtra("snooze_type");
        String id = intent.getStringExtra("snooze_id");
        String title = intent.getStringExtra("snooze_title");
        if (type == null || id == null || title == null) return;
        boolean todo = "todo".equals(type);
        String channelId;
        String page;
        if (todo) {
            ReminderScheduler.ensureChannel(context);
            channelId = ReminderScheduler.CHANNEL_ID;
            page = "todo";
        } else {
            StandaloneReminderScheduler.ensureChannel(context);
            channelId = StandaloneReminderScheduler.CHANNEL_ID;
            page = "reminder";
        }

        int requestCode = SnoozeScheduler.requestCode(type, id);
        Intent openIntent = new Intent(context, MainActivity.class)
            .putExtra("open_page", page)
            .putExtra("open_notification_action_dialog", true)
            .putExtra("notification_action_type", type)
            .putExtra("notification_action_id", id)
            .putExtra("notification_action_title", title)
            .putExtra("notification_id", requestCode)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            requestCode,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent confirmIntent = new Intent(context, NotificationActionReceiver.class)
            .putExtra("notification_id", requestCode);
        PendingIntent confirmAction = PendingIntent.getBroadcast(
            context,
            requestCode ^ 0x434F,
            confirmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent snoozeIntent = new Intent(context, MainActivity.class)
            .putExtra("open_page", page)
            .putExtra("notification_id", requestCode)
            .putExtra("snooze_type", type)
            .putExtra("snooze_id", id)
            .putExtra("snooze_title", title)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent snoozeAction = PendingIntent.getActivity(
            context,
            requestCode ^ 0x534E,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText("补 · 稍后提醒时间到了")
            .setStyle(new NotificationCompat.BigTextStyle().bigText(title))
            .setContentIntent(contentIntent)
            .addAction(0, "确认", confirmAction)
            .addAction(0, "稍后", snoozeAction)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);
        ReminderExpandedNotificationView.apply(
            notification, context, title, "补 · 稍后提醒时间到了",
            contentIntent, snoozeAction, confirmAction);
        manager.notify(requestCode, notification.build());
    }
}
