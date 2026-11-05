package com.quitsmoke.app;

import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
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
    private static final AtomicBoolean checking = new AtomicBoolean(false);
    private static final AtomicBoolean downloading = new AtomicBoolean(false);

    private AppUpdater() {}

    public static void check(MainActivity activity) {
        if (!checking.compareAndSet(false, true)) return;
        toast(activity, "正在检查更新…");
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
                    toast(activity, "当前已是最新版本 " + current);
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
                toast(activity, "检查更新失败：" + safeMessage(error));
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
            .setMessage("是否从 GitHub 下载并安装？")
            .setNegativeButton("取消", null)
            .setPositiveButton("下载并安装", (dialog, which) -> downloadAndInstall(
                activity,
                version,
                asset.optString("url"),
                asset.optString("browser_download_url"),
                asset.optString("digest")
            ))
            .show();
    }

    private static void downloadAndInstall(
            MainActivity activity,
            String version,
            String apiDownloadUrl,
            String browserDownloadUrl,
            String digest) {
        if (apiDownloadUrl.isEmpty() && browserDownloadUrl.isEmpty()) {
            toast(activity, "下载地址无效");
            return;
        }
        if (!downloading.compareAndSet(false, true)) {
            toast(activity, "更新正在下载");
            return;
        }
        toast(activity, "正在下载新版本…");
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
                try {
                    downloadVerified(apiDownloadUrl, temp, expectedHash);
                } catch (Exception apiError) {
                    if (temp.exists()) temp.delete();
                    if (!browserDownloadUrl.isEmpty()) {
                        downloadVerified(browserDownloadUrl, temp, expectedHash);
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
            } catch (Exception error) {
                if (temp != null && temp.exists()) temp.delete();
                toast(activity, "更新下载失败：" + safeMessage(error));
            } finally {
                downloading.set(false);
            }
        }, "bu-update-download").start();
    }

    private static void downloadVerified(
            String address, File target, String expectedHash) throws Exception {
        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        HttpURLConnection connection = openConnection(address, "application/octet-stream");
        int code = connection.getResponseCode();
        if (code != 200) throw new Exception("下载服务器返回 " + code);
        try (InputStream input = connection.getInputStream();
             FileOutputStream output = new FileOutputStream(target)) {
            byte[] buffer = new byte[16384];
            int count;
            while ((count = input.read(buffer)) > 0) {
                output.write(buffer, 0, count);
                sha256.update(buffer, 0, count);
            }
        } finally {
            connection.disconnect();
        }
        if (!expectedHash.isEmpty() && !expectedHash.equals(hex(sha256.digest()))) {
            throw new Exception("安装包校验失败");
        }
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
