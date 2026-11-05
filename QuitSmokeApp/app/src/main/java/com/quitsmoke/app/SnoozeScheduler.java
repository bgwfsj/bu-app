package com.quitsmoke.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class SnoozeScheduler {
    private static final String ACTION_SNOOZE = "com.quitsmoke.app.SNOOZE";

    private SnoozeScheduler() {}

    public static boolean schedule(
            Context context, String type, String id, String title, int minutes) {
        if (!"todo".equals(type) && !"standalone".equals(type)) return false;
        if (id == null || id.trim().isEmpty() || title == null) return false;
        long delay = Math.max(1, Math.min(1440, minutes)) * 60000L;
        long triggerAt = System.currentTimeMillis() + delay;
        int requestCode = requestCode(type, id);

        Intent intent = new Intent(context, SnoozeReceiver.class);
        intent.setAction(ACTION_SNOOZE);
        intent.putExtra("snooze_type", type);
        intent.putExtra("snooze_id", id);
        intent.putExtra("snooze_title", title);
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return false;
        manager.cancel(pending);
        if (Build.VERSION.SDK_INT >= 31 && manager.canScheduleExactAlarms()) {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        } else if (Build.VERSION.SDK_INT >= 23) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        } else {
            manager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        }
        return true;
    }

    public static int requestCode(String type, String id) {
        return ("snooze:" + type + ":" + id).hashCode() & 0x7fffffff;
    }
}
