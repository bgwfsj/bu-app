package com.quitsmoke.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.app.NotificationManagerCompat;

import java.util.HashSet;
import java.util.Set;

public class NotificationActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int notificationId = intent.getIntExtra("notification_id", -1);
        if (notificationId >= 0) {
            NotificationManagerCompat.from(context).cancel(notificationId);
        }
        String reminderId = intent.getStringExtra("reminder_confirm_id");
        if (reminderId != null && "once".equals(intent.getStringExtra("reminder_confirm_mode"))) {
            SharedPreferences prefs = context.getSharedPreferences(
                "notification_confirmations", Context.MODE_PRIVATE);
            Set<String> ids = new HashSet<>(
                prefs.getStringSet("reminder_ids", new HashSet<>()));
            ids.add(reminderId);
            prefs.edit().putStringSet("reminder_ids", ids).commit();
        }
    }
}
