package com.quitsmoke.app;

import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.widget.Toast;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

public final class AppUpdater {
    private static final String LATEST_RELEASE_API =
        "https://api.github.com/repos/bgwfsj/bu-app/releases/latest";
    private static final String USER_AGENT = "Bu-Android-Updater";
    private static final String UPDATE_CHANNEL_ID = "app_updates";
    private static final int UPDATE_NOTIFICATION_ID = 9901;
    private static final AtomicBoolean checking = new AtomicBoolean(false);
    private static final AtomicBoolean downloading = new AtomicBoolean(false);

    private AppUpdater() {}

    public static void check(MainActivity activity) {
        check(activity, false);
    }

    public static void checkOnStartup(MainActivity activity) {
        check(activity, true);
    }

    private static void check(MainActivity activity, boolean silent) {
        if (!checking.compareAndSet(false, true)) return;
        if (!silent) toast(activity, "正在检查更新…");
        new Thread(() -> {
            try {
                HttpURLConnection connection = openConnection(
                    LATEST_RELEASE_API, "application/vnd.github+json");
                int code = connection.getResponseCode();
                if (code != 200) throw new Exception("GitHub 返回 " + code);
                String json;
                try (InputStream input = connection.getInputStream()) {
                    json = readText(input);
                } finally {
                    connection.disconnect();
                }

                JSONObject release = new JSONObject(json);
                String tag = release.optString("tag_name");
                String version = tag.startsWith("v") ? tag.substring(1) : tag;
                String current = currentVersion(activity);
                if (!isNewer(version, current)) {
                    if (!silent) toast(activity, "当前已是最新版本 " + current);
                    return;
                }

                JSONArray assets = release.optJSONArray("assets");
                JSONObject apkAsset = null;
                if (assets != null) {
                    for (int i = 0; i < assets.length(); i++) {
                        JSONObject asset = assets.optJSONObject(i);
                        String name = asset == null ? "" : asset.optString("name", "");
                        if (name.toLowerCase(Locale.US).endsWith(".apk")) {
                            apkAsset = asset;
                            break;
                        }
                    }
                }
                if (apkAsset == null) throw new Exception("最新版本没有 APK 附件");
                JSONObject finalAsset = apkAsset;
                activity.runOnUiThread(() -> showUpdateDialog(activity, tag, version, finalAsset));
            } catch (Exception error) {
                if (!silent) toast(activity, "检查更新失败：" + safeMessage(error));
            } finally {
                checking.set(false);
            }
        }, "bu-update-check").start();
    }

    private static void showUpdateDialog(
            MainActivity activity, String tag, String version, JSONObject asset) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity)
            .setTitle("发现新版本 " + version)
            .setMessage("更新前会自动导出一份完整数据备份。是否从 GitHub 下载并安装？")
            .setNegativeButton("取消", null)
            .setPositiveButton("备份并更新", (dialog, which) -> activity.backupBeforeUpdate(
                () -> downloadAndInstall(
                    activity,
                    version,
                    asset.optString("url"),
                    asset.optString("browser_download_url"),
                    asset.optString("digest"),
                    asset.optLong("size", -1)
                )
            ))
            .show();
    }

    private static void downloadAndInstall(
            MainActivity activity,
            String version,
            String apiDownloadUrl,
            String browserDownloadUrl,
            String digest,
            long sizeHint) {
        if (apiDownloadUrl.isEmpty() && browserDownloadUrl.isEmpty()) {
            toast(activity, "下载地址无效");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            toast(activity, "更新正在下载");
            return;
        }
        toast(activity, "正在下载新版本…");
        ensureUpdateChannel(activity);
        notifyDownloadProgress(activity, version, 0, sizeHint);
        new Thread(() -> {
            File temp = null;
            try {
                File dir = new File(activity.getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建更新目录");
                File apk = new File(dir, "bu-" + sanitizeVersion(version) + ".apk");
                temp = new File(dir, apk.getName() + ".part");
                if (temp.exists() && !temp.delete()) throw new Exception("无法清理旧下载");

                String expectedHash = digest.startsWith("sha256:")
                    ? digest.substring("sha256:".length()).toLowerCase(Locale.US)
                    : "";
                ProgressReporter reporter = (downloaded, total) ->
                    notifyDownloadProgress(activity, version, downloaded, total);
                try {
                    downloadVerified(apiDownloadUrl, temp, expectedHash, sizeHint, reporter);
                } catch (Exception apiError) {
                    if (temp.exists()) temp.delete();
                    if (!browserDownloadUrl.isEmpty()) {
                        reporter.onProgress(0, sizeHint);
                        downloadVerified(
                            browserDownloadUrl, temp, expectedHash, sizeHint, reporter);
                    } else {
                        throw apiError;
                    }
                }
                if (apk.exists() && !apk.delete()) throw new Exception("无法替换旧安装包");
                if (!temp.renameTo(apk)) throw new Exception("无法保存安装包");

                Uri uri = FileProvider.getUriForFile(
                    activity,
                    activity.getPackageName() + ".updates",
                    apk
                );
                Intent install = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.runOnUiThread(() -> {
                    try {
                        activity.startActivity(install);
                    } catch (Exception error) {
                        Toast.makeText(
                            activity,
                            "无法打开安装器，请允许安装未知应用",
                            Toast.LENGTH_LONG
                        ).show();
                    }
                });
                notifyDownloadComplete(activity, version);
            } catch (Exception error) {
                if (temp != null && temp.exists()) temp.delete();
                notifyDownloadFailed(activity, version, safeMessage(error));
                toast(activity, "更新下载失败：" + safeMessage(error));
            } finally {
                downloading.set(false);
            }
        }, "bu-update-download").start();
    }

    private interface ProgressReporter {
        void onProgress(long downloaded, long total);
    }

    private static void downloadVerified(
            String address,
            File target,
            String expectedHash,
            long sizeHint,
            ProgressReporter reporter) throws Exception {
        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        HttpURLConnection connection = openConnection(address, "application/octet-stream");
        int code = connection.getResponseCode();
        if (code != 200) throw new Exception("下载服务器返回 " + code);
        long total = connection.getContentLengthLong();
        if (total <= 0) total = sizeHint;
        try (InputStream input = connection.getInputStream();
             FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[16384];
            int count;
            long downloaded = 0;
            long lastReport = 0;
            while ((count = input.read(buffer)) > 0) {
                output.write(buffer, 0, count);
                sha256.update(buffer, 0, count);
                downloaded += count;
                long now = System.currentTimeMillis();
                if (now - lastReport >= 250) {
                    lastReport = now;
                    reporter.onProgress(downloaded, total);
                }
            }
            reporter.onProgress(downloaded, total);
        } finally {
            connection.disconnect();
        }
        if (!expectedHash.isEmpty() && !expectedHash.equals(hex(sha256.digest()))) {
            throw new Exception("安装包校验失败");
        }
    }

    private static void ensureUpdateChannel(MainActivity activity) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = activity.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            UPDATE_CHANNEL_ID,
            "应用更新",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("显示安装包下载进度");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private static void notifyDownloadProgress(
            MainActivity activity, String version, long downloaded, long total) {
        NotificationCompat.Builder notification = new NotificationCompat.Builder(
            activity, UPDATE_CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("正在下载补 " + version)
            .setContentText(progressText(downloaded, total))
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (total > 0) {
            int percent = (int) Math.min(100, downloaded * 100 / total);
            notification.setProgress(100, percent, false);
        } else {
            notification.setProgress(0, 0, true);
        }
        NotificationManagerCompat.from(activity)
            .notify(UPDATE_NOTIFICATION_ID, notification.build());
    }

    private static void notifyDownloadComplete(MainActivity activity, String version) {
        NotificationCompat.Builder notification = new NotificationCompat.Builder(
            activity, UPDATE_CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("补 " + version + " 下载完成")
            .setContentText("正在打开系统安装器")
            .setProgress(0, 0, false)
            .setOngoing(false)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        NotificationManagerCompat.from(activity)
            .notify(UPDATE_NOTIFICATION_ID, notification.build());
    }

    private static void notifyDownloadFailed(
            MainActivity activity, String version, String detail) {
        NotificationCompat.Builder notification = new NotificationCompat.Builder(
            activity, UPDATE_CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("补 " + version + " 下载失败")
            .setContentText(detail)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(detail))
            .setProgress(0, 0, false)
            .setOngoing(false)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        NotificationManagerCompat.from(activity)
            .notify(UPDATE_NOTIFICATION_ID, notification.build());
    }

    private static String progressText(long downloaded, long total) {
        double doneMb = downloaded / 1024.0 / 1024.0;
        if (total > 0) {
            double totalMb = total / 1024.0 / 1024.0;
            int percent = (int) Math.min(100, downloaded * 100 / total);
            return percent + "% · " + String.format(Locale.US, "%.1f / %.1f MB", doneMb, totalMb);
        }
        return String.format(Locale.US, "%.1f MB", doneMb);
    }

    private static HttpURLConnection openConnection(String address, String accept) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setRequestProperty("Accept", accept);
        connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
        return connection;
    }

    private static String readText(InputStream input) throws Exception {
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = input.read(buffer)) > 0) output.write(buffer, 0, count);
        return new String(output.toByteArray(), "UTF-8");
    }

    private static String currentVersion(MainActivity activity) {
        try {
            PackageInfo info = activity.getPackageManager()
                .getPackageInfo(activity.getPackageName(), 0);
            return info.versionName == null ? "0" : info.versionName;
        } catch (Exception error) {
            return "0";
        }
    }

    private static boolean isNewer(String remote, String current) {
        String[] left = remote.split("[^0-9]+");
        String[] right = current.split("[^0-9]+");
        int count = Math.max(left.length, right.length);
        for (int i = 0; i < count; i++) {
            int a = i < left.length && !left[i].isEmpty() ? Integer.parseInt(left[i]) : 0;
            int b = i < right.length && !right[i].isEmpty() ? Integer.parseInt(right[i]) : 0;
            if (a > b) return true;
            if (a < b) return false;
        }
        return false;
    }

    private static String sanitizeVersion(String version) {
        return version.replaceAll("[^0-9A-Za-z._-]", "_");
    }

    private static String hex(byte[] bytes) {
        StringBuilder output = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) output.append(String.format(Locale.US, "%02x", value));
        return output.toString();
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? "网络连接失败" : message;
    }

    private static void toast(MainActivity activity, String message) {
        activity.runOnUiThread(
            () -> Toast.makeText(activity, message, Toast.LENGTH_LONG).show()
        );
    }
}
