package com.quitsmoke.app;

import android.app.PendingIntent;
import android.content.Context;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

final class ReminderExpandedNotificationView {
    private ReminderExpandedNotificationView() {}

    static void apply(
            NotificationCompat.Builder builder,
            Context context,
            String title,
            String body,
            PendingIntent openAction,
            PendingIntent snoozeAction,
            PendingIntent confirmAction) {
        RemoteViews content = new RemoteViews(
            context.getPackageName(), R.layout.notification_reminder_expanded);
        content.setTextViewText(R.id.notification_expanded_title, title);
        content.setTextViewText(R.id.notification_expanded_body, body);
        content.setOnClickPendingIntent(R.id.notification_expanded_root, openAction);
        content.setOnClickPendingIntent(R.id.notification_expanded_snooze, snoozeAction);
        content.setOnClickPendingIntent(R.id.notification_expanded_confirm, confirmAction);
        builder.setCustomContentView(content)
            .setCustomBigContentView(content)
            .setCustomHeadsUpContentView(content);
    }
}
