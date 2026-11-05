package com.quitsmoke.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

public final class ReminderScheduler {
    public static final String PREFS = "todo_reminder";
    public static final String KEY_ENABLED = "enabled";
    public static final String KEY_HOUR = "hour";
    public static final String KEY_MINUTE = "minute";
    public static final String KEY_PENDING = "pending";
    public static final String KEY_DATE = "date";
    public static final String CHANNEL_ID = "todo_daily_reminder_v5";
    private static final int ALARM_REQUEST = 4101;

    private ReminderScheduler() {}

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        manager.deleteNotificationChannel("todo_daily_reminder");
        manager.deleteNotificationChannel("todo_daily_reminder_v2");
        manager.deleteNotificationChannel("todo_daily_reminder_v3");
        manager.deleteNotificationChannel("todo_daily_reminder_v4");
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "每日待办提醒",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("每天晚上提醒尚未完成的待办");
        manager.createNotificationChannel(channel);
    }

    public static void schedule(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;

        int hour = prefs.getInt(KEY_HOUR, 20);
        int minute = prefs.getInt(KEY_MINUTE, 0);
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }

        Intent intent = new Intent(context, DailyReminderReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            ALARM_REQUEST,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        manager.cancel(pendingIntent);
        boolean canUseAlarmClock =
            Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms();
        if (canUseAlarmClock) {
            Intent showIntent = new Intent(context, MainActivity.class)
                .putExtra("open_page", "todo")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent showPending = PendingIntent.getActivity(
                context,
                ALARM_REQUEST,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            manager.setAlarmClock(
                new AlarmManager.AlarmClockInfo(next.getTimeInMillis(), showPending),
                pendingIntent
            );
        } else if (Build.VERSION.SDK_INT >= 23) {
            manager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                next.getTimeInMillis(),
                pendingIntent
            );
        } else {
            manager.setExact(
                AlarmManager.RTC_WAKEUP,
                next.getTimeInMillis(),
                pendingIntent
            );
        }
    }

    public static void cancel(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_ENABLED, false)
            .apply();
        Intent intent = new Intent(context, DailyReminderReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            ALARM_REQUEST,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) manager.cancel(pendingIntent);
    }
}
