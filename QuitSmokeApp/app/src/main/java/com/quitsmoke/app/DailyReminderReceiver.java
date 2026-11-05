package com.quitsmoke.app;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class DailyReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences prefs = context.getSharedPreferences(
            ReminderScheduler.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(ReminderScheduler.KEY_ENABLED, false)) return;
        if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        ReminderScheduler.ensureChannel(context);
        int pending = prefs.getInt(ReminderScheduler.KEY_PENDING, 0);
        String savedDate = prefs.getString(ReminderScheduler.KEY_DATE, "");
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(new Date());
        String body = savedDate.equals(today) && pending > 0
            ? "还有 " + pending + " 项没有完成"
            : "打开补，看看今天还有什么要补";

        Intent openIntent = new Intent(context, MainActivity.class)
            .putExtra("open_page", "todo")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent confirmIntent = new Intent(context, NotificationActionReceiver.class)
            .putExtra("notification_id", 4101);
        PendingIntent confirmAction = PendingIntent.getBroadcast(
            context,
            4101 ^ 0x434F,
            confirmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent snoozeIntent = new Intent(context, MainActivity.class)
            .putExtra("open_page", "todo")
            .putExtra("notification_id", 4101)
            .putExtra("snooze_type", "todo")
            .putExtra("snooze_id", "todo_daily")
            .putExtra("snooze_title", "今晚的待办")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent snoozeAction = PendingIntent.getActivity(
            context,
            4101 ^ 0x534E,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(
            context, ReminderScheduler.CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("补 · 今晚的待办")
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .addAction(0, "确认", confirmAction)
            .addAction(0, "稍后", snoozeAction)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        NotificationManagerCompat.from(context).notify(4101, notification.build());
        ReminderScheduler.schedule(context);
    }
}
