package com.quitsmoke.app;

import android.app.PendingIntent;
import android.content.Context;

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
        return new NotificationCompat.Builder(context, channelId)
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
    }
}
