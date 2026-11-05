package com.quitsmoke.app;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class ReminderLockscreenActivity extends AppCompatActivity {
    private int notificationId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }

        Intent source = getIntent();
        notificationId = source.getIntExtra("notification_id", -1);
        String title = source.getStringExtra("reminder_title");
        String body = source.getStringExtra("reminder_body");
        if (title == null || title.trim().isEmpty()) finish();
        if (body == null || body.trim().isEmpty()) body = "补 · 提醒时间到了";

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.argb(210, 22, 30, 27));
        root.setPadding(dp(24), dp(24), dp(24), dp(24));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(22), dp(22), dp(22), dp(20));
        GradientDrawable cardBackground = new GradientDrawable();
        cardBackground.setColor(Color.rgb(252, 253, 252));
        cardBackground.setCornerRadius(dp(22));
        cardBackground.setStroke(dp(1), Color.rgb(225, 234, 229));
        card.setBackground(cardBackground);

        TextView kicker = new TextView(this);
        kicker.setText("补 · 锁屏提醒");
        kicker.setTextColor(Color.rgb(10, 128, 94));
        kicker.setTextSize(12);
        kicker.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        kicker.setLetterSpacing(0.08f);
        card.addView(kicker, matchWrap());

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.rgb(30, 51, 43));
        titleView.setTextSize(25);
        titleView.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = matchWrap();
        titleParams.topMargin = dp(12);
        card.addView(titleView, titleParams);

        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextColor(Color.rgb(100, 120, 111));
        bodyView.setTextSize(14);
        bodyView.setLineSpacing(dp(3), 1f);
        LinearLayout.LayoutParams bodyParams = matchWrap();
        bodyParams.topMargin = dp(7);
        card.addView(bodyView, bodyParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams actionsParams = matchWrap();
        actionsParams.topMargin = dp(20);
        card.addView(actions, actionsParams);

        Button snooze = actionButton("稍后", Color.rgb(234, 244, 239), Color.rgb(49, 94, 80));
        Button confirm = actionButton("确认", Color.rgb(49, 94, 80), Color.WHITE);
        LinearLayout.LayoutParams leftParams = new LinearLayout.LayoutParams(0, dp(48), 1f);
        leftParams.rightMargin = dp(8);
        actions.addView(snooze, leftParams);
        actions.addView(confirm, new LinearLayout.LayoutParams(0, dp(48), 1f));

        snooze.setOnClickListener(v -> openSnooze(source));
        confirm.setOnClickListener(v -> confirmReminder(source));

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        );
        root.addView(card, cardParams);
        setContentView(root);
    }

    private Button actionButton(String label, int background, int textColor) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(15);
        button.setTextColor(textColor);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(background);
        shape.setCornerRadius(dp(12));
        button.setBackground(shape);
        return button;
    }

    private void openSnooze(Intent source) {
        Intent intent = new Intent(this, MainActivity.class)
            .putExtra("open_page", source.getStringExtra("snooze_page"))
            .putExtra("notification_id", notificationId)
            .putExtra("snooze_type", source.getStringExtra("snooze_type"))
            .putExtra("snooze_id", source.getStringExtra("snooze_id"))
            .putExtra("snooze_title", source.getStringExtra("snooze_title"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finishAndRemoveTask();
    }

    private void confirmReminder(Intent source) {
        Intent confirm = new Intent(this, NotificationActionReceiver.class)
            .putExtra("notification_id", notificationId)
            .putExtra("reminder_confirm_id", source.getStringExtra("reminder_confirm_id"))
            .putExtra("reminder_confirm_mode", source.getStringExtra("reminder_confirm_mode"));
        sendBroadcast(confirm);
        finishAndRemoveTask();
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
