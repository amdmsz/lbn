package com.lbn.crm;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "LbnCallRecorder",
    permissions = {
        @Permission(
            alias = "callRecording",
            strings = {
                Manifest.permission.CALL_PHONE,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.RECORD_AUDIO
            }
        ),
        @Permission(
            alias = "audioLibraryLegacy",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
        ),
        @Permission(
            alias = "audioLibraryModern",
            strings = {
                Manifest.permission.READ_MEDIA_AUDIO
            }
        ),
        @Permission(
            alias = "notifications",
            strings = {
                Manifest.permission.POST_NOTIFICATIONS
            }
        )
    }
)
public class LbnCallRecorderPlugin extends Plugin {
    private static final String ALIAS_CALL_RECORDING = "callRecording";
    private static final String ALIAS_AUDIO_LIBRARY_LEGACY = "audioLibraryLegacy";
    private static final String ALIAS_AUDIO_LIBRARY_MODERN = "audioLibraryModern";
    private static final String ALIAS_NOTIFICATIONS = "notifications";

    private BroadcastReceiver sessionReceiver;
    private final ExecutorService connectionExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        sessionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String session = intent.getStringExtra(CallRecordingService.EXTRA_SESSION_JSON);
                if (session == null || session.isEmpty()) {
                    return;
                }

                try {
                    notifyListeners("callRecordingSessionUpdated", new JSObject(session), true);
                } catch (JSONException ignored) {
                }
            }
        };

        IntentFilter filter = new IntentFilter(CallRecordingService.ACTION_SESSION_UPDATED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(sessionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(sessionReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (sessionReceiver != null) {
            try {
                getContext().unregisterReceiver(sessionReceiver);
            } catch (IllegalArgumentException ignored) {
            } finally {
                sessionReceiver = null;
            }
        }

        connectionExecutor.shutdownNow();
    }

    @PluginMethod
    public void getDeviceProfile(PluginCall call) {
        JSObject result = new JSObject();
        result.put("deviceFingerprint", getDeviceFingerprint());
        result.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
        result.put("androidVersion", Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")");
        result.put("appVersion", getAppVersionName());
        result.put("recordingCapability", hasRequiredRuntimePermissions() ? "SUPPORTED" : "UNKNOWN");
        result.put("permissions", buildRecorderPermissionResult());
        call.resolve(result);
    }

    @PluginMethod
    public void checkRecorderPermissions(PluginCall call) {
        call.resolve(buildRecorderPermissionResult());
    }

    @PluginMethod
    public void requestRecorderPermissions(PluginCall call) {
        requestPermissionForAliases(
            getRequiredPermissionAliases(),
            call,
            "recorderPermissionCallback"
        );
    }

    @PermissionCallback
    public void recorderPermissionCallback(PluginCall call) {
        call.resolve(buildRecorderPermissionResult());
    }

    @PluginMethod
    public void startRecordedSimCall(PluginCall call) {
        String phone = requiredString(call, "phone");
        String callRecordId = requiredString(call, "callRecordId");
        String customerId = requiredString(call, "customerId");
        String customerName = call.getString("customerName", "");
        String deviceId = call.getString("deviceId", "");
        String apiBaseUrl = requiredString(call, "apiBaseUrl");
        Integer chunkSize = call.getInt("chunkSizeBytes", 1024 * 1024);
        Boolean forceSpeakerphone = call.getBoolean("forceSpeakerphone", false);

        if (phone == null || callRecordId == null || customerId == null || apiBaseUrl == null) {
            call.reject("缺少拨号参数。");
            return;
        }

        if (!hasRequiredRuntimePermissions()) {
            call.reject(describeMissingRecorderPermissions());
            return;
        }

        Intent serviceIntent = new Intent(getContext(), CallRecordingService.class);
        serviceIntent.putExtra(CallRecordingService.EXTRA_PHONE, phone);
        serviceIntent.putExtra(CallRecordingService.EXTRA_CALL_RECORD_ID, callRecordId);
        serviceIntent.putExtra(CallRecordingService.EXTRA_CUSTOMER_ID, customerId);
        serviceIntent.putExtra(CallRecordingService.EXTRA_CUSTOMER_NAME, customerName);
        serviceIntent.putExtra(CallRecordingService.EXTRA_DEVICE_ID, deviceId);
        serviceIntent.putExtra(CallRecordingService.EXTRA_API_BASE_URL, apiBaseUrl);
        serviceIntent.putExtra(CallRecordingService.EXTRA_CHUNK_SIZE_BYTES, chunkSize);
        serviceIntent.putExtra(
            CallRecordingService.EXTRA_FORCE_SPEAKERPHONE,
            forceSpeakerphone != null && forceSpeakerphone
        );
        ContextCompat.startForegroundService(getContext(), serviceIntent);

        Intent callIntent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(phone)));
        callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getActivity().startActivity(callIntent);
        } catch (Exception error) {
            call.reject("无法打开系统电话拨号。", error);
            return;
        }

        JSObject result = new JSObject();
        result.put("started", true);
        result.put("callRecordId", callRecordId);
        result.put("deviceId", deviceId);
        call.resolve(result);
    }

    @PluginMethod
    public void retryPendingUploads(PluginCall call) {
        String apiBaseUrl = requiredString(call, "apiBaseUrl");
        Integer chunkSize = call.getInt("chunkSizeBytes", 1024 * 1024);

        if (apiBaseUrl == null) {
            call.reject("缺少 CRM API 地址。");
            return;
        }

        SharedPreferences preferences = getContext().getSharedPreferences(
            CallRecordingService.PREFERENCES_NAME,
            Context.MODE_PRIVATE
        );
        int queued = 0;
        JSONArray pendingUploads = new JSONArray();

        for (Map.Entry<String, ?> entry : preferences.getAll().entrySet()) {
            if (!entry.getKey().startsWith(CallRecordingService.PENDING_UPLOAD_PREFIX)) {
                continue;
            }

            Object value = entry.getValue();
            if (!(value instanceof String) || ((String) value).trim().isEmpty()) {
                continue;
            }

            pendingUploads.put((String) value);
            queued++;
        }

        if (queued > 0) {
            Intent serviceIntent = new Intent(getContext(), CallRecordingService.class);
            serviceIntent.putExtra(CallRecordingService.EXTRA_RETRY_UPLOAD_JSON, pendingUploads.toString());
            serviceIntent.putExtra(CallRecordingService.EXTRA_API_BASE_URL, apiBaseUrl);
            serviceIntent.putExtra(CallRecordingService.EXTRA_CHUNK_SIZE_BYTES, chunkSize);
            ContextCompat.startForegroundService(getContext(), serviceIntent);
        }

        JSObject result = new JSObject();
        result.put("queued", queued);
        call.resolve(result);
    }

    @PluginMethod
    public void getCallSessionSnapshot(PluginCall call) {
        String callRecordId = call.getString("callRecordId", "");
        SharedPreferences preferences = getContext().getSharedPreferences(
            CallRecordingService.PREFERENCES_NAME,
            Context.MODE_PRIVATE
        );
        String session = null;

        if (!callRecordId.isEmpty()) {
            session = preferences.getString(CallRecordingService.sessionKey(callRecordId), null);
        }

        if (session == null) {
            session = preferences.getString(CallRecordingService.LAST_SESSION_KEY, null);
        }

        if (session == null) {
            call.resolve(new JSObject());
            return;
        }

        try {
            call.resolve(new JSObject(session));
        } catch (JSONException error) {
            call.reject("本地通话状态读取失败。", error);
        }
    }

    @PluginMethod
    public void getConnectionProfile(PluginCall call) {
        JSObject result = new JSObject();
        result.put("serverUrl", MainActivity.getServerUrl(getContext()));
        result.put("defaultServerUrl", MainActivity.DEFAULT_SERVER_URL);
        result.put("updateManifestUrl", MainActivity.getUpdateManifestUrl(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void saveConnectionProfile(PluginCall call) {
        String serverUrl = requiredString(call, "serverUrl");

        if (serverUrl == null) {
            call.reject("服务器或代理地址不能为空。");
            return;
        }

        String normalizedServerUrl = MainActivity.normalizeServerUrl(serverUrl);
        MainActivity.saveServerUrl(getContext(), normalizedServerUrl);

        JSObject result = new JSObject();
        result.put("serverUrl", normalizedServerUrl);
        result.put("updateManifestUrl", MainActivity.getUpdateManifestUrl(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void reloadApp(PluginCall call) {
        String serverUrl = MainActivity.getServerUrl(getContext());

        getActivity().runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().loadUrl(serverUrl);
            }
        });

        JSObject result = new JSObject();
        result.put("serverUrl", serverUrl);
        call.resolve(result);
    }

    @PluginMethod
    public void testConnection(PluginCall call) {
        String rawServerUrl = call.getString("serverUrl", MainActivity.getServerUrl(getContext()));
        String serverUrl = MainActivity.normalizeServerUrl(rawServerUrl);

        connectionExecutor.execute(() -> {
            HttpURLConnection connection = null;

            try {
                connection = (HttpURLConnection) new URL(serverUrl).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setRequestProperty("Accept", "text/html,application/json");

                int status = connection.getResponseCode();
                String response = readSmallResponse(connection);
                JSObject result = new JSObject();
                result.put("ok", status >= 200 && status < 400);
                result.put("status", status);
                result.put("serverUrl", serverUrl);
                result.put("preview", response);
                call.resolve(result);
            } catch (Exception error) {
                JSObject result = new JSObject();
                result.put("ok", false);
                result.put("status", 0);
                result.put("serverUrl", serverUrl);
                result.put("message", error.getMessage());
                call.resolve(result);
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }

    private String readSmallResponse(HttpURLConnection connection) {
        try {
            InputStream stream = connection.getResponseCode() >= 400
                ? connection.getErrorStream()
                : connection.getInputStream();

            if (stream == null) {
                return "";
            }

            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                char[] buffer = new char[160];
                int read = reader.read(buffer);
                return read <= 0 ? "" : new String(buffer, 0, read);
            }
        } catch (Exception ignored) {
            return "";
        }
    }

    private String requiredString(PluginCall call, String key) {
        String value = call.getString(key, "");
        return value.trim().isEmpty() ? null : value.trim();
    }

    private boolean hasCoreRuntimePermissions() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasRequiredRuntimePermissions() {
        return hasCoreRuntimePermissions() &&
            hasAudioLibraryPermission() &&
            hasNotificationPermission();
    }

    private boolean hasAudioLibraryPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }

        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }

        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private String[] getRequiredPermissionAliases() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return new String[] {
                ALIAS_CALL_RECORDING,
                ALIAS_AUDIO_LIBRARY_MODERN,
                ALIAS_NOTIFICATIONS
            };
        }

        return new String[] {
            ALIAS_CALL_RECORDING,
            ALIAS_AUDIO_LIBRARY_LEGACY
        };
    }

    private JSObject buildRecorderPermissionResult() {
        JSObject result = new JSObject();
        result.put(
            ALIAS_CALL_RECORDING,
            aggregatePermissionState(new String[] {
                Manifest.permission.CALL_PHONE,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.RECORD_AUDIO
            })
        );
        result.put(
            "audioLibrary",
            aggregatePermissionState(new String[] {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    ? Manifest.permission.READ_MEDIA_AUDIO
                    : Manifest.permission.READ_EXTERNAL_STORAGE
            })
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            result.put(
                ALIAS_NOTIFICATIONS,
                aggregatePermissionState(new String[] {
                    Manifest.permission.POST_NOTIFICATIONS
                })
            );
        }

        return result;
    }

    private String aggregatePermissionState(String[] permissions) {
        boolean shouldShowRationale = false;

        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED) {
                continue;
            }

            if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                getActivity() != null &&
                getActivity().shouldShowRequestPermissionRationale(permission)
            ) {
                shouldShowRationale = true;
            }
        }

        if (allPermissionsGranted(permissions)) {
            return "granted";
        }

        return shouldShowRationale ? "prompt-with-rationale" : "prompt";
    }

    private boolean allPermissionsGranted(String[] permissions) {
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(getContext(), permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }

        return true;
    }

    private String describeMissingRecorderPermissions() {
        StringBuilder missing = new StringBuilder();

        appendMissingPermission(missing, !hasCoreRuntimePermissions(), "电话、通话状态或麦克风");
        appendMissingPermission(missing, !hasAudioLibraryPermission(), "系统录音读取");
        appendMissingPermission(missing, !hasNotificationPermission(), "通知");

        if (missing.length() == 0) {
            return "缺少录音所需权限。";
        }

        return "缺少" + missing + "权限。";
    }

    private void appendMissingPermission(StringBuilder builder, boolean shouldAppend, String label) {
        if (!shouldAppend) {
            return;
        }

        if (builder.length() > 0) {
            builder.append("、");
        }

        builder.append(label);
    }

    private String getDeviceFingerprint() {
        String androidId = Settings.Secure.getString(
            getContext().getContentResolver(),
            Settings.Secure.ANDROID_ID
        );

        if (androidId == null || androidId.trim().isEmpty()) {
            return getContext().getPackageName() + "-" + Build.SERIAL;
        }

        return getContext().getPackageName() + "-" + androidId;
    }

    private String getAppVersionName() {
        try {
            PackageInfo packageInfo = getContext()
                .getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            return packageInfo.versionName == null ? "" : packageInfo.versionName;
        } catch (PackageManager.NameNotFoundException error) {
            return "";
        }
    }
}
