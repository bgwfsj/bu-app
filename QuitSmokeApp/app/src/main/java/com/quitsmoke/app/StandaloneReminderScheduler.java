package com.quitsmoke.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public final class StandaloneReminderScheduler {
    public static final String PREFS = "standalone_reminders";
    public static final String KEY_ITEMS = "items";
    public static final String CHANNEL_ID = "standalone_reminders";
    private static final String ACTION_FIRE = "com.quitsmoke.app.STANDALONE_REMINDER";
    private static final int SHOW_REQUEST_XOR = 0x5348;

    private StandaloneReminderScheduler() {}

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "独立提醒",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("到点提醒你设置的独立事项");
        manager.createNotificationChannel(channel);
    }

    public static void sync(Context context, String remindersJson) {
        cancelStored(context);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_ITEMS, remindersJson).apply();
        try {
            JSONArray items = new JSONArray(remindersJson);
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null) scheduleNext(context, item);
            }
        } catch (Exception ignored) {
            // Keep the last valid stored schedule if malformed data arrives.
        }
    }

    public static void rescheduleAll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sync(context, prefs.getString(KEY_ITEMS, "[]"));
    }

    public static void continueRecurring(Context context, String reminderJson) {
        try {
            JSONObject item = new JSONObject(reminderJson);
            if (!"once".equals(item.optString("mode"))) scheduleNext(context, item);
        } catch (Exception ignored) {}
    }

    public static int requestCode(String id) {
        return ("standalone:" + id).hashCode() & 0x7fffffff;
    }

    private static void cancelStored(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray items = new JSONArray(prefs.getString(KEY_ITEMS, "[]"));
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null) cancel(context, item.optString("id"));
            }
        } catch (Exception ignored) {}
    }

    private static void cancel(Context context, String id) {
        Intent intent = new Intent(context, StandaloneReminderReceiver.class);
        intent.setAction(ACTION_FIRE);
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            requestCode(id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) manager.cancel(pending);
    }

    private static void scheduleNext(Context context, JSONObject item) {
        long triggerAt = nextTrigger(item, System.currentTimeMillis());
        if (triggerAt <= 0) return;
        String id = item.optString("id");
        scheduleAt(context, id, item, triggerAt);
    }

    private static void scheduleAt(Context context, String id, JSONObject item, long triggerAt) {
        Intent intent = new Intent(context, StandaloneReminderReceiver.class);
        intent.setAction(ACTION_FIRE);
        intent.putExtra("reminder_id", id);
        intent.putExtra("reminder_json", item.toString());
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            requestCode(id),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        manager.cancel(pending);
        boolean canUseAlarmClock = Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms();
        if (canUseAlarmClock) {
            Intent showIntent = new Intent(context, MainActivity.class)
                .putExtra("open_page", "reminder")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent showPending = PendingIntent.getActivity(
                context,
                requestCode(id) ^ SHOW_REQUEST_XOR,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            manager.setAlarmClock(
                new AlarmManager.AlarmClockInfo(triggerAt, showPending),
                pending
            );
        } else if (Build.VERSION.SDK_INT >= 23) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        } else {
            manager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        }
    }

    private static long nextTrigger(JSONObject item, long now) {
        try {
            String mode = item.optString("mode");
            String time = item.optString("time", "09:00");
            String[] hm = time.split(":");
            int hour = Math.max(0, Math.min(23, Integer.parseInt(hm[0])));
            int minute = Math.max(0, Math.min(59, Integer.parseInt(hm[1])));

            if ("once".equals(mode)) {
                SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US);
                format.setLenient(false);
                Date date = format.parse(item.optString("date") + " " + time);
                long value = date.getTime();
                return value > now ? value : -1;
            }

            Calendar current = Calendar.getInstance();
            current.setTimeInMillis(now);

            if ("daily".equals(mode)) {
                Calendar candidate = (Calendar) current.clone();
                candidate.set(Calendar.HOUR_OF_DAY, hour);
                candidate.set(Calendar.MINUTE, minute);
                candidate.set(Calendar.SECOND, 0);
                candidate.set(Calendar.MILLISECOND, 0);
                if (candidate.getTimeInMillis() <= now) {
                    candidate.add(Calendar.DAY_OF_YEAR, 1);
                }
                return candidate.getTimeInMillis();
            }

            if ("weekly".equals(mode)) {
                int targetJsDay = Math.max(0, Math.min(6, item.optInt("weekday", 1)));
                int currentJsDay = current.get(Calendar.DAY_OF_WEEK) - 1;
                int delta = (targetJsDay - currentJsDay + 7) % 7;
                Calendar candidate = (Calendar) current.clone();
                candidate.add(Calendar.DAY_OF_YEAR, delta);
                candidate.set(Calendar.HOUR_OF_DAY, hour);
                candidate.set(Calendar.MINUTE, minute);
                candidate.set(Calendar.SECOND, 0);
                candidate.set(Calendar.MILLISECOND, 0);
                if (candidate.getTimeInMillis() <= now) candidate.add(Calendar.DAY_OF_YEAR, 7);
                return candidate.getTimeInMillis();
            }

            if ("monthly".equals(mode)) {
                int wantedDay = Math.max(1, Math.min(31, item.optInt("day", 1)));
                Calendar month = Calendar.getInstance();
                month.setTimeInMillis(now);
                month.set(Calendar.DAY_OF_MONTH, 1);
                for (int i = 0; i < 24; i++) {
                    int lastDay = month.getActualMaximum(Calendar.DAY_OF_MONTH);
                    Calendar candidate = (Calendar) month.clone();
                    candidate.set(Calendar.DAY_OF_MONTH, Math.min(wantedDay, lastDay));
                    candidate.set(Calendar.HOUR_OF_DAY, hour);
                    candidate.set(Calendar.MINUTE, minute);
                    candidate.set(Calendar.SECOND, 0);
                    candidate.set(Calendar.MILLISECOND, 0);
                    if (candidate.getTimeInMillis() > now) return candidate.getTimeInMillis();
                    month.add(Calendar.MONTH, 1);
                }
                return -1;
            }

            if ("yearly".equals(mode)) {
                int month = Math.max(1, Math.min(12, item.optInt("month", 1))) - 1;
                int wantedDay = Math.max(1, Math.min(31, item.optInt("day", 1)));
                for (int year = current.get(Calendar.YEAR); year <= current.get(Calendar.YEAR) + 8; year++) {
                    Calendar candidate = Calendar.getInstance();
                    candidate.clear();
                    candidate.set(year, month, 1, hour, minute, 0);
                    int lastDay = candidate.getActualMaximum(Calendar.DAY_OF_MONTH);
                    candidate.set(Calendar.DAY_OF_MONTH, Math.min(wantedDay, lastDay));
                    if (candidate.getTimeInMillis() > now) return candidate.getTimeInMillis();
                }
            }
        } catch (Exception ignored) {}
        return -1;
    }
}
