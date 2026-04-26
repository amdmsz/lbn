package com.lbn.crm;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

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
    private static final String UPDATE_MANIFEST_URL = "http://crm.cclbn.com/client-update.json";
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LbnCallRecorderPlugin.class);
        super.onCreate(savedInstanceState);
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
                HttpURLConnection connection = (HttpURLConnection) new URL(UPDATE_MANIFEST_URL).openConnection();
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
