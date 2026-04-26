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

import org.json.JSONException;

@CapacitorPlugin(
    name = "LbnCallRecorder",
    permissions = {
        @Permission(
            alias = "callRecording",
            strings = {
                Manifest.permission.CALL_PHONE,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS,
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.READ_MEDIA_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS
            }
        )
    }
)
public class LbnCallRecorderPlugin extends Plugin {
    private BroadcastReceiver sessionReceiver;

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
        if (sessionReceiver == null) {
            return;
        }

        try {
            getContext().unregisterReceiver(sessionReceiver);
        } catch (IllegalArgumentException ignored) {
        } finally {
            sessionReceiver = null;
        }
    }

    @PluginMethod
    public void getDeviceProfile(PluginCall call) {
        JSObject result = new JSObject();
        result.put("deviceFingerprint", getDeviceFingerprint());
        result.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
        result.put("androidVersion", Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")");
        result.put("appVersion", getAppVersionName());
        result.put("recordingCapability", hasCoreRuntimePermissions() ? "SUPPORTED" : "UNKNOWN");
        call.resolve(result);
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

        if (!hasCoreRuntimePermissions()) {
            call.reject("缺少电话、录音或通话状态权限。");
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

    private String requiredString(PluginCall call, String key) {
        String value = call.getString(key, "");
        return value.trim().isEmpty() ? null : value.trim();
    }

    private boolean hasCoreRuntimePermissions() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
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
