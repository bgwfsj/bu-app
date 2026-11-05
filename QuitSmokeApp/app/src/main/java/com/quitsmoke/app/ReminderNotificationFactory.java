package com.quitsmoke.app;

import android.app.PendingIntent;
import android.content.Context;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

final class ReminderNotificationFactory {
    private ReminderNotificationFactory() {}

    static NotificationCompat.Builder create(
            Context context,
            String channelId,
            String title,
            String body,
            PendingIntent openAction,
            PendingIntent snoozeAction,
            PendingIntent confirmAction,
            int priority) {
        RemoteViews content = new RemoteViews(
            context.getPackageName(), R.layout.notification_reminder);
        content.setTextViewText(R.id.notification_title, title);
        content.setTextViewText(R.id.notification_body, body);
        content.setOnClickPendingIntent(R.id.notification_root, openAction);
        content.setOnClickPendingIntent(R.id.notification_snooze, snoozeAction);
        content.setOnClickPendingIntent(R.id.notification_confirm, confirmAction);

        return new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(openAction)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(content)
            .setCustomBigContentView(content)
            .setCustomHeadsUpContentView(content)
            .setAutoCancel(true)
            .setPriority(priority)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);
    }
}
