package com.quitsmoke.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
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
            PendingIntent fullScreenAction,
            int priority) {
        NotificationCompat.Builder publicBuilder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_bu)
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
            .setCategory(NotificationCompat.CATEGORY_ALARM);

        RemoteViews expanded = new RemoteViews(
            context.getPackageName(), R.layout.notification_reminder);
        expanded.setTextViewText(R.id.notification_title, title);
        expanded.setTextViewText(R.id.notification_body, body);
        expanded.setOnClickPendingIntent(R.id.notification_root, openAction);
        expanded.setOnClickPendingIntent(R.id.notification_snooze, snoozeAction);
        expanded.setOnClickPendingIntent(R.id.notification_confirm, confirmAction);

        return new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_bu)
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
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setFullScreenIntent(fullScreenAction, true)
            .setPublicVersion(publicBuilder.build());
    }

    static PendingIntent fullScreenAction(
            Context context,
            int notificationId,
            String title,
            String body,
            String page,
            String snoozeType,
            String snoozeId,
            String snoozeTitle,
            String confirmId,
            String confirmMode) {
        Intent intent = new Intent(context, ReminderLockscreenActivity.class)
            .putExtra("notification_id", notificationId)
            .putExtra("reminder_title", title)
            .putExtra("reminder_body", body)
            .putExtra("snooze_page", page)
            .putExtra("snooze_type", snoozeType)
            .putExtra("snooze_id", snoozeId)
            .putExtra("snooze_title", snoozeTitle)
            .putExtra("reminder_confirm_id", confirmId)
            .putExtra("reminder_confirm_mode", confirmMode)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            context,
            notificationId ^ 0x4C53,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
