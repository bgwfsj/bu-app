package com.quitsmoke.app;

import android.Manifest;
import android.content.ContentValues;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.util.Log;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final String TAG = "QuitSmoke";
    private static final int REQUEST_NOTIFICATIONS = 901;
    private ActivityResultLauncher<Intent> filePickerLauncher;
    private String filePickerPurpose = "csv";
    private final Handler liveTimerHandler = new Handler(Looper.getMainLooper());
    private final Runnable liveTimerTick = new Runnable() {
        @Override
        public void run() {
            if (webView != null) {
                webView.evaluateJavascript(
                    "(window.paintLiveTimers && window.paintLiveTimers())",
                    null
                );
            }
            liveTimerHandler.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ReminderScheduler.ensureChannel(this);
        StandaloneReminderScheduler.ensureChannel(this);
        filePickerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                    handlePickedFile(result.getData());
                }
            }
        );

        // 不使用全屏沉浸，内容自动避开状态栏
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);          // localStorage：戒烟起始时间/喝水记录
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setTextZoom(100);                     // 不跟随系统字体缩放，保持排版
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);                // 禁止双指缩放/双击放大
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setAllowContentAccess(false);

        // 去掉滚动到边缘的蓝色光晕，横向滑动更干净
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setBackgroundColor(0xFFF6F8FA);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("file:///android_asset")) return false;
                try {
                    android.content.Intent intent = new android.content.Intent(
                        android.content.Intent.ACTION_VIEW, request.getUrl());
                    startActivity(intent);
                } catch (Exception e) {
                    Log.e(TAG, "Cannot open URL: " + url);
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Log.d(TAG, "Page loaded: " + url);
                openPendingPage(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                Log.e(TAG, "WebView error: " + error.getDescription());
            }
        });

        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new NativeBridge(), "AppNative");

        webView.loadUrl("file:///android_asset/index.html");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView == null) {
                    finish();
                    return;
                }
                webView.evaluateJavascript(
                    "(function(){try{return !!(window.handleBack && window.handleBack());}catch(e){return false;}})()",
                    value -> {
                        if (!"true".equals(value)) finish();
                    }
                );
            }
        });
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private class NativeBridge {
        @JavascriptInterface
        public boolean configureDailyReminder(int hour, int minute, int pendingCount, String date) {
            hour = Math.max(0, Math.min(23, hour));
            minute = Math.max(0, Math.min(59, minute));
            getSharedPreferences(ReminderScheduler.PREFS, MODE_PRIVATE).edit()
                .putBoolean(ReminderScheduler.KEY_ENABLED, true)
                .putInt(ReminderScheduler.KEY_HOUR, hour)
                .putInt(ReminderScheduler.KEY_MINUTE, minute)
                .putInt(ReminderScheduler.KEY_PENDING, Math.max(0, pendingCount))
                .putString(ReminderScheduler.KEY_DATE, date)
                .apply();

            if (!hasNotificationPermission()) {
                runOnUiThread(() -> requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS));
                return false;
            }
            ReminderScheduler.schedule(MainActivity.this);
            return true;
        }

        @JavascriptInterface
        public void cancelDailyReminder() {
            ReminderScheduler.cancel(MainActivity.this);
        }

        @JavascriptInterface
        public boolean configureStandaloneReminders(String remindersJson, boolean requestPermission) {
            String normalized = remindersJson == null ? "[]" : remindersJson;
            try {
                JSONArray items = new JSONArray(normalized);
                StandaloneReminderScheduler.sync(MainActivity.this, items.toString());
                boolean permitted = hasNotificationPermission();
                if (requestPermission && items.length() > 0 && !permitted) {
                    runOnUiThread(() -> requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS));
                }
                return items.length() == 0 || permitted;
            } catch (Exception error) {
                Log.e(TAG, "Invalid standalone reminder payload", error);
                return false;
            }
        }

        @JavascriptInterface
        public boolean scheduleSnoozeNotification(
                String type, String id, String title, int minutes) {
            return SnoozeScheduler.schedule(
                MainActivity.this, type, id, title, minutes);
        }

        @JavascriptInterface
        public void checkForUpdates() {
            AppUpdater.check(MainActivity.this);
        }

        @JavascriptInterface
        public boolean saveFile(String name, String base64, String mime) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                String safeName = (name == null || name.trim().isEmpty()) ? "事件账本.csv" : name;
                safeName = safeName.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE,
                        (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new Exception("无法创建文件");
                    OutputStream output = getContentResolver().openOutputStream(uri);
                    if (output == null) throw new Exception("无法写入文件");
                    output.write(data);
                    output.flush();
                    output.close();
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir != null && !dir.exists()) dir.mkdirs();
                    File file = new File(dir, safeName);
                    FileOutputStream output = new FileOutputStream(file);
                    output.write(data);
                    output.flush();
                    output.close();
                }
                toast("已保存到手机的下载目录：" + safeName);
                return true;
            } catch (Exception e) {
                toast("保存失败：" + e.getMessage());
                return false;
            }
        }

        @JavascriptInterface
        public int cleanupOldBackups(int keep) {
            int safeKeep = Math.max(1, Math.min(20, keep));
            int deleted = 0;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    String[] projection = {
                        MediaStore.MediaColumns._ID,
                        MediaStore.MediaColumns.DATE_ADDED
                    };
                    List<Long> ids = new ArrayList<>();
                    try (Cursor cursor = getContentResolver().query(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                            projection,
                            MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?",
                            new String[]{"补-%备份-%.json"},
                            MediaStore.MediaColumns.DATE_ADDED + " DESC, " +
                                MediaStore.MediaColumns._ID + " DESC")) {
                        if (cursor != null) {
                            int idColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
                            while (cursor.moveToNext()) ids.add(cursor.getLong(idColumn));
                        }
                    }
                    for (int i = safeKeep; i < ids.size(); i++) {
                        Uri uri = ContentUris.withAppendedId(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI, ids.get(i));
                        deleted += getContentResolver().delete(uri, null, null);
                    }
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (dir == null || !dir.exists()) return 0;
                    File[] files = dir.listFiles((folder, name) ->
                        name.startsWith("补-") && name.contains("备份-") && name.endsWith(".json"));
                    if (files == null) return 0;
                    java.util.Arrays.sort(
                        files,
                        Comparator.comparingLong(File::lastModified).reversed()
                    );
                    for (int i = safeKeep; i < files.length; i++) {
                        if (files[i].delete()) deleted++;
                    }
                }
            } catch (Exception error) {
                Log.e(TAG, "Failed to clean old backups", error);
                return -1;
            }
            return deleted;
        }

        @JavascriptInterface
        public String getAppVersion() {
            try {
                android.content.pm.PackageInfo info = getPackageManager()
                    .getPackageInfo(getPackageName(), 0);
                return info.versionName == null ? "" : info.versionName;
            } catch (Exception error) {
                return "";
            }
        }

        @JavascriptInterface
        public String consumeConfirmedReminderIds() {
            android.content.SharedPreferences prefs = getSharedPreferences(
                "notification_confirmations", MODE_PRIVATE);
            Set<String> ids = new HashSet<>(prefs.getStringSet("reminder_ids", new HashSet<>()));
            prefs.edit().remove("reminder_ids").apply();
            return new org.json.JSONArray(ids).toString();
        }

        @JavascriptInterface
        public String consumeHandledReminderKeys() {
            android.content.SharedPreferences prefs = getSharedPreferences(
                "notification_confirmations", MODE_PRIVATE);
            Set<String> keys = new HashSet<>(prefs.getStringSet(
                "handled_keys", new HashSet<>()));
            prefs.edit().remove("handled_keys").apply();
            return new org.json.JSONArray(keys).toString();
        }

        @JavascriptInterface
        public void pickCsvFile() {
            runOnUiThread(() -> {
                filePickerPurpose = "csv";
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                    "text/csv", "text/comma-separated-values", "text/plain"
                });
                filePickerLauncher.launch(intent);
            });
        }

        @JavascriptInterface
        public void pickBackupFile() {
            runOnUiThread(() -> {
                filePickerPurpose = "backup";
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain"});
                filePickerLauncher.launch(intent);
            });
        }
    }

    void backupBeforeUpdate(Runnable afterBackup) {
        if (webView == null) {
            toast("更新前备份失败，已停止下载");
            return;
        }
        webView.evaluateJavascript(
            "(function(){try{return !!(window.exportUpdateBackup && window.exportUpdateBackup());}" +
                "catch(e){return false;}})()",
            value -> {
                if ("true".equals(value)) {
                    toast("更新前备份已保存，开始下载新版本");
                    afterBackup.run();
                } else {
                    toast("更新前备份失败，已停止下载");
                }
            }
        );
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_NOTIFICATIONS && grantResults.length > 0 &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            ReminderScheduler.schedule(this);
            StandaloneReminderScheduler.rescheduleAll(this);
        }
    }

    private void openPendingPage(WebView view) {
        Intent intent = getIntent();
        if (intent == null) return;
        String page = intent.getStringExtra("open_page");
        String snoozeType = intent.getStringExtra("snooze_type");
        String snoozeId = intent.getStringExtra("snooze_id");
        String snoozeTitle = intent.getStringExtra("snooze_title");
        boolean openActionDialog = intent.getBooleanExtra("open_notification_action_dialog", false);
        String actionType = intent.getStringExtra("notification_action_type");
        String actionId = intent.getStringExtra("notification_action_id");
        String actionTitle = intent.getStringExtra("notification_action_title");
        String actionEventKey = intent.getStringExtra("notification_event_key");
        int notificationId = intent.getIntExtra("notification_id", -1);
        if (!"reminder".equals(page) && !"todo".equals(page) &&
                snoozeType == null && !openActionDialog) return;
        if (notificationId >= 0) {
            NotificationManagerCompat.from(this).cancel(notificationId);
        }
        StringBuilder script = new StringBuilder();
        if ("reminder".equals(page) || "todo".equals(page)) {
            script.append("window.goPage&&window.goPage(")
                .append("todo".equals(page) ? "4" : "6")
                .append(");");
        }
        if (snoozeType != null && snoozeId != null && snoozeTitle != null) {
            script.append("window.openSnoozeDialog&&window.openSnoozeDialog(")
                .append(JSONObject.quote(snoozeType)).append(',')
                .append(JSONObject.quote(snoozeId)).append(',')
                .append(JSONObject.quote(snoozeTitle)).append(");");
        }
        if (openActionDialog && actionType != null && actionId != null && actionTitle != null) {
            script.append("window.openNotificationActionDialog&&window.openNotificationActionDialog(")
                .append(JSONObject.quote(actionType)).append(',')
                .append(JSONObject.quote(actionId)).append(',')
                .append(JSONObject.quote(actionTitle)).append(',')
                .append(notificationId).append(',')
                .append(JSONObject.quote(actionEventKey == null ? "" : actionEventKey)).append(");");
        }
        intent.removeExtra("open_page");
        view.evaluateJavascript(
            "(function(){" + script + "}()),true",
            null
        );
        intent.removeExtra("snooze_type");
        intent.removeExtra("snooze_id");
        intent.removeExtra("snooze_title");
        intent.removeExtra("open_notification_action_dialog");
        intent.removeExtra("notification_action_type");
        intent.removeExtra("notification_action_id");
        intent.removeExtra("notification_action_title");
        intent.removeExtra("notification_event_key");
        intent.removeExtra("notification_id");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) openPendingPage(webView);
    }

    private void handlePickedFile(Intent data) {
        if (data.getData() == null) return;
        try {
            InputStream input = getContentResolver().openInputStream(data.getData());
            if (input == null) throw new Exception("无法打开文件");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) > 0) output.write(buffer, 0, count);
            input.close();
            String text = new String(output.toByteArray(), "UTF-8");
            String target = "backup".equals(filePickerPurpose) ? "receiveAppBackup" : "receiveImportedCsv";
            webView.evaluateJavascript(
                "window." + target + " && window." + target + "(" + JSONObject.quote(text) + ")",
                null
            );
        } catch (Exception e) {
            toast("导入失败：" + e.getMessage());
        }
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onRestoreInstanceState(Bundle savedInstanceState) {
        super.onRestoreInstanceState(savedInstanceState);
        if (webView != null) webView.restoreState(savedInstanceState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        liveTimerHandler.removeCallbacks(liveTimerTick);
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        liveTimerHandler.removeCallbacks(liveTimerTick);
        liveTimerHandler.post(liveTimerTick);
        ReminderScheduler.schedule(this);
        StandaloneReminderScheduler.rescheduleAll(this);
        if (webView != null) {
            webView.evaluateJavascript(
                "(window.applyConfirmedReminders && window.applyConfirmedReminders(), true)",
                null
            );
        }
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        liveTimerHandler.removeCallbacks(liveTimerTick);
        super.onDestroy();
    }
}
