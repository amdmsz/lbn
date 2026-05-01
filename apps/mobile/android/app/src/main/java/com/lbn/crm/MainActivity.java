package com.lbn.crm;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

import com.lbn.crm.BuildConfig;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    public static final String PREFERENCES_NAME = "lbn_crm_connection";
    public static final String KEY_SERVER_URL = "serverUrl";
    public static final String PRODUCTION_SERVER_URL = "https://crm.cclbn.com/mobile";
    public static final String LOCAL_TEST_SERVER_URL = "http://192.168.31.128:3000/mobile";
    public static final String DEFAULT_SERVER_URL = BuildConfig.DEBUG
            ? LOCAL_TEST_SERVER_URL
            : PRODUCTION_SERVER_URL;
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        config = new CapConfig.Builder(this)
                .setServerUrl(getServerUrl(this))
                .setAllowMixedContent(true)
                .create();
        registerPlugin(LbnCallRecorderPlugin.class);
        super.onCreate(savedInstanceState);
        configureSystemBars();
        checkForUpdates();
    }

    @Override
    public void onDestroy() {
        updateExecutor.shutdownNow();
        super.onDestroy();
    }

    private void checkForUpdates() {
        updateExecutor.execute(() -> {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(getUpdateManifestUrl(this)).openConnection();
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept", "application/json");
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);

                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    return;
                }

                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        body.append(line);
                    }
                } finally {
                    connection.disconnect();
                }

                JSONObject manifest = new JSONObject(body.toString());
                String latestVersion = manifest.optString("version", "").trim();
                JSONObject androidManifest = manifest.optJSONObject("android");
                String downloadUrl = androidManifest != null
                        ? androidManifest.optString("downloadUrl", "")
                        : manifest.optString("downloadUrl", "");
                String notes = manifest.optString("notes", "请下载并安装新版客户端。");

                if (!latestVersion.isEmpty() && compareVersions(BuildConfig.VERSION_NAME, latestVersion) > 0) {
                    runOnUiThread(() -> showUpdateDialog(latestVersion, notes, downloadUrl));
                }
            } catch (Exception ignored) {
            }
        });
    }

    private void configureSystemBars() {
        Window window = getWindow();
        window.setStatusBarColor(Color.WHITE);
        window.setNavigationBarColor(Color.WHITE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                            | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            );
        }
    }

    public static String getServerUrl(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        String storedServerUrl = preferences.getString(KEY_SERVER_URL, null);

        if (storedServerUrl == null || storedServerUrl.trim().isEmpty()) {
            return DEFAULT_SERVER_URL;
        }

        String normalizedServerUrl = normalizeServerUrl(storedServerUrl);

        if (BuildConfig.DEBUG && PRODUCTION_SERVER_URL.equals(normalizedServerUrl)) {
            return LOCAL_TEST_SERVER_URL;
        }

        return normalizedServerUrl;
    }

    public static void saveServerUrl(Context context, String serverUrl) {
        context
                .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SERVER_URL, normalizeServerUrl(serverUrl))
                .apply();
    }

    public static String normalizeServerUrl(String rawValue) {
        String value = rawValue == null ? "" : rawValue.trim();

        if (value.isEmpty()) {
            value = DEFAULT_SERVER_URL;
        }

        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "https://" + value;
        }

        while (value.endsWith("/") && value.length() > "https://x".length()) {
            value = value.substring(0, value.length() - 1);
        }

        try {
            URL url = new URL(value);
            String path = url.getPath() == null ? "" : url.getPath();

            if (path.isEmpty() || "/".equals(path)) {
                return value + "/mobile";
            }

            return value;
        } catch (Exception error) {
            return DEFAULT_SERVER_URL;
        }
    }

    public static String getUpdateManifestUrl(Context context) {
        try {
            URL url = new URL(getServerUrl(context));
            String port = url.getPort() > 0 ? ":" + url.getPort() : "";
            return url.getProtocol() + "://" + url.getHost() + port + "/client-update.json";
        } catch (Exception error) {
            return BuildConfig.DEBUG
                    ? "http://192.168.31.128:3000/client-update.json"
                    : "https://crm.cclbn.com/client-update.json";
        }
    }

    private void showUpdateDialog(String latestVersion, String notes, String downloadUrl) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle("发现新版本")
                .setMessage("发现 Lbn CRM 新版本 " + latestVersion + "\n\n" + notes)
                .setNegativeButton("稍后再说", null);

        if (!downloadUrl.isEmpty()) {
            builder.setPositiveButton("下载更新", (dialog, which) -> {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(downloadUrl));
                startActivity(intent);
            });
        }

        builder.show();
    }

    private int compareVersions(String currentVersion, String nextVersion) {
        String[] currentParts = currentVersion.split("[.-]");
        String[] nextParts = nextVersion.split("[.-]");
        int length = Math.max(currentParts.length, nextParts.length);

        for (int index = 0; index < length; index++) {
            int current = parseVersionPart(currentParts, index);
            int next = parseVersionPart(nextParts, index);

            if (next > current) return 1;
            if (next < current) return -1;
        }

        return 0;
    }

    private int parseVersionPart(String[] parts, int index) {
        if (index >= parts.length) return 0;

        try {
            return Integer.parseInt(parts[index]);
        } catch (NumberFormatException error) {
            return 0;
        }
    }
}
