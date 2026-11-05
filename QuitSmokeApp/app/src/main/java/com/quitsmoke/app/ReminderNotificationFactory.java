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
        NotificationCompat.Builder publicBuilder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(context.getColor(R.color.mint))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(openAction)
            .addAction(R.drawable.ic_notification_snooze, "稍后", snoozeAction)
            .addAction(R.drawable.ic_notification_confirm, "确认", confirmAction)
            .setAutoCancel(true)
            .setPriority(priority)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);

        RemoteViews expanded = new RemoteViews(
            context.getPackageName(), R.layout.notification_reminder);
        expanded.setTextViewText(R.id.notification_title, title);
        expanded.setTextViewText(R.id.notification_body, body);
        expanded.setOnClickPendingIntent(R.id.notification_root, openAction);
        expanded.setOnClickPendingIntent(R.id.notification_snooze, snoozeAction);
        expanded.setOnClickPendingIntent(R.id.notification_confirm, confirmAction);

        return new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(context.getColor(R.color.mint))
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(openAction)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(expanded)
            .setCustomBigContentView(expanded)
            .setCustomHeadsUpContentView(expanded)
            .setAutoCancel(true)
            .setPriority(priority)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPublicVersion(publicBuilder.build());
    }
}
