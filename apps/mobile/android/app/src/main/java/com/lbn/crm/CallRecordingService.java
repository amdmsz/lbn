package com.lbn.crm;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.database.Cursor;
import android.media.AudioManager;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.MediaStore;
import android.telephony.PhoneStateListener;
import android.telephony.TelephonyManager;
import android.webkit.CookieManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CallRecordingService extends Service {
    public static final String EXTRA_PHONE = "phone";
    public static final String EXTRA_CALL_RECORD_ID = "callRecordId";
    public static final String EXTRA_CUSTOMER_ID = "customerId";
    public static final String EXTRA_CUSTOMER_NAME = "customerName";
    public static final String EXTRA_DEVICE_ID = "deviceId";
    public static final String EXTRA_API_BASE_URL = "apiBaseUrl";
    public static final String EXTRA_CHUNK_SIZE_BYTES = "chunkSizeBytes";
    public static final String EXTRA_FORCE_SPEAKERPHONE = "forceSpeakerphone";
    public static final String EXTRA_SESSION_JSON = "sessionJson";
    public static final String ACTION_SESSION_UPDATED = "com.lbn.crm.CALL_RECORDING_SESSION_UPDATED";
    public static final String PREFERENCES_NAME = "lbn_call_recording_sessions";
    public static final String LAST_SESSION_KEY = "last_call_session";

    private static final String CHANNEL_ID = "call_recording";
    private static final int NOTIFICATION_ID = 4101;
    private static final int DEFAULT_CHUNK_SIZE_BYTES = 1024 * 1024;
    private static final long NO_CALL_TIMEOUT_MS = 3 * 60 * 1000L;
    private static final long SYSTEM_RECORDING_LOOKUP_TIMEOUT_MS = 25 * 1000L;
    private static final long SYSTEM_RECORDING_LOOKUP_INTERVAL_MS = 2 * 1000L;
    private static final long MIN_RECORDING_FILE_BYTES = 1024L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private TelephonyManager telephonyManager;
    private MediaRecorder recorder;
    private File outputFile;
    private String phone;
    private String callRecordId;
    private String customerId;
    private String customerName;
    private String deviceId;
    private String apiBaseUrl;
    private int chunkSizeBytes = DEFAULT_CHUNK_SIZE_BYTES;
    private boolean forceSpeakerphone = false;
    private boolean seenOffhook;
    private boolean finishing;
    private long callConnectedAtMs;
    private String activeAudioSourceName = "";
    private AudioManager audioManager;
    private boolean speakerphoneChanged;
    private boolean previousSpeakerphoneOn;

    private final PhoneStateListener phoneStateListener = new PhoneStateListener() {
        @Override
        public void onCallStateChanged(int state, String incomingNumber) {
            handleCallStateChanged(state);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        phone = intent.getStringExtra(EXTRA_PHONE);
        callRecordId = intent.getStringExtra(EXTRA_CALL_RECORD_ID);
        customerId = intent.getStringExtra(EXTRA_CUSTOMER_ID);
        customerName = intent.getStringExtra(EXTRA_CUSTOMER_NAME);
        deviceId = intent.getStringExtra(EXTRA_DEVICE_ID);
        apiBaseUrl = trimTrailingSlash(intent.getStringExtra(EXTRA_API_BASE_URL));
        chunkSizeBytes = intent.getIntExtra(EXTRA_CHUNK_SIZE_BYTES, DEFAULT_CHUNK_SIZE_BYTES);
        forceSpeakerphone = intent.getBooleanExtra(EXTRA_FORCE_SPEAKERPHONE, true);

        if (isBlank(phone) || isBlank(callRecordId) || isBlank(customerId) || isBlank(apiBaseUrl)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startForegroundNotification();
        persistSession("STARTED", "PENDING", null, null, 0);
        registerPhoneStateListener();
        handler.postDelayed(this::finishIfNoCallConnected, NO_CALL_TIMEOUT_MS);

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        unregisterPhoneStateListener();
        stopRecorderQuietly();
        restoreAudioRoutingQuietly();
        networkExecutor.shutdownNow();
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public static String sessionKey(String callRecordId) {
        return "call_session_" + callRecordId;
    }

    private void handleCallStateChanged(int state) {
        if (state == TelephonyManager.CALL_STATE_OFFHOOK && !seenOffhook) {
            seenOffhook = true;
            callConnectedAtMs = System.currentTimeMillis();
            enableSpeakerphoneForCapture();

            if (startRecorder()) {
                persistSession("RECORDING", "PENDING", null, null, 0);
            }
            return;
        }

        if (state == TelephonyManager.CALL_STATE_IDLE && seenOffhook) {
            finishSession("CALL_ENDED");
        }
    }

    private void finishIfNoCallConnected() {
        if (seenOffhook || finishing) {
            return;
        }

        persistSession("FAILED", "CANCELED", null, "电话未进入通话状态。", 0);
        stopSelf();
    }

    private void finishSession(String reason) {
        if (finishing) {
            return;
        }

        finishing = true;
        unregisterPhoneStateListener();
        int durationSeconds = getDurationSeconds();
        File recordingFile = stopRecorderQuietly();
        restoreAudioRoutingQuietly();

        networkExecutor.execute(() -> {
            try {
                patchCallEnd(durationSeconds);
                RecordingPayload recordingPayload = selectRecordingPayload(recordingFile, durationSeconds);

                if (
                    recordingPayload == null ||
                    !recordingPayload.file.exists() ||
                    recordingPayload.file.length() <= 0L
                ) {
                    persistSession("FAILED", "FAILED", null, "本机未生成有效录音文件。", durationSeconds);
                    return;
                }

                persistSession("UPLOADING", "UPLOADING", null, null, durationSeconds);
                UploadResult uploadResult = uploadRecording(recordingPayload, durationSeconds);
                persistSession("READY", uploadResult.status, uploadResult.recordingId, null, durationSeconds);
                if (recordingPayload.deleteAfterUpload) {
                    deleteQuietly(recordingPayload.file);
                }
            } catch (Exception error) {
                persistSession("FAILED", "FAILED", null, error.getMessage(), durationSeconds);
            } finally {
                stopSelf();
            }
        });
    }

    private int getDurationSeconds() {
        if (callConnectedAtMs <= 0L) {
            return 0;
        }

        long durationMs = Math.max(0L, System.currentTimeMillis() - callConnectedAtMs);
        return (int) Math.min(24 * 60 * 60, Math.round(durationMs / 1000.0));
    }

    private void startForegroundNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "通话录音",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("正在保存 CRM 外呼录音");
            manager.createNotificationChannel(channel);
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, openIntent, pendingFlags);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Lbn CRM 通话")
            .setContentText("正在记录本次客户通话")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private boolean startRecorder() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            persistSession("FAILED", "PENDING", null, "缺少录音权限。", 0);
            return false;
        }

        try {
            File directory = new File(getFilesDir(), "call-recordings");
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IOException("无法创建本地录音目录。");
            }

            RecorderStartResult result = startRecorderWithFallback(directory);
            outputFile = result.file;
            activeAudioSourceName = result.audioSourceName;
            return true;
        } catch (Exception error) {
            stopRecorderQuietly();
            persistSession("FAILED", "PENDING", null, "本机启动录音失败：" + error.getMessage(), 0);
            return false;
        }
    }

    private RecorderStartResult startRecorderWithFallback(File directory) throws Exception {
        int[] audioSources = new int[] {
            MediaRecorder.AudioSource.MIC,
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            MediaRecorder.AudioSource.DEFAULT
        };
        Exception latestError = null;

        for (int audioSource : audioSources) {
            File candidate = new File(directory, callRecordId + "-" + System.currentTimeMillis() + ".m4a");
            MediaRecorder candidateRecorder = null;

            try {
                candidateRecorder = new MediaRecorder();
                candidateRecorder.setAudioSource(audioSource);
                candidateRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
                candidateRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                candidateRecorder.setAudioEncodingBitRate(64000);
                candidateRecorder.setAudioSamplingRate(16000);
                candidateRecorder.setOutputFile(candidate.getAbsolutePath());
                candidateRecorder.prepare();
                candidateRecorder.start();
                recorder = candidateRecorder;
                return new RecorderStartResult(candidate, audioSourceName(audioSource));
            } catch (Exception error) {
                latestError = error;
                releaseRecorderQuietly(candidateRecorder);
                deleteQuietly(candidate);
            }
        }

        throw latestError == null ? new IOException("没有可用的录音音源。") : latestError;
    }

    private RecordingPayload selectRecordingPayload(@Nullable File fallbackFile, int durationSeconds) {
        RecordingPayload systemRecording = findSystemRecordingPayload(durationSeconds);

        if (systemRecording != null) {
            if (fallbackFile != null && !fallbackFile.equals(systemRecording.file)) {
                deleteQuietly(fallbackFile);
            }

            return systemRecording;
        }

        if (fallbackFile == null || !fallbackFile.exists() || fallbackFile.length() <= 0L) {
            return null;
        }

        activeAudioSourceName = isBlank(activeAudioSourceName)
            ? "APP_MIC"
            : "APP_" + activeAudioSourceName;

        return new RecordingPayload(fallbackFile, "audio/mp4", "aac", true);
    }

    private RecordingPayload findSystemRecordingPayload(int durationSeconds) {
        if (!hasAudioLibraryPermission()) {
            return null;
        }

        long deadlineMs = System.currentTimeMillis() + SYSTEM_RECORDING_LOOKUP_TIMEOUT_MS;

        while (System.currentTimeMillis() <= deadlineMs) {
            try {
                SystemRecordingCandidate candidate = queryBestSystemRecordingCandidate(durationSeconds);

                if (candidate != null) {
                    RecordingPayload payload = copySystemRecordingToInternalFile(candidate);
                    activeAudioSourceName = "SYSTEM_MEDIASTORE";
                    return payload;
                }
            } catch (Exception ignored) {
            }

            try {
                Thread.sleep(SYSTEM_RECORDING_LOOKUP_INTERVAL_MS);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return null;
            }
        }

        return null;
    }

    private SystemRecordingCandidate queryBestSystemRecordingCandidate(int durationSeconds) {
        ContentResolver resolver = getContentResolver();
        Uri collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        String[] projection = getSystemRecordingProjection();
        long minDateModifiedSeconds = Math.max(0L, (callConnectedAtMs - 15_000L) / 1000L);
        String selection = MediaStore.Audio.Media.DATE_MODIFIED + " >= ?";
        String[] selectionArgs = new String[] { String.valueOf(minDateModifiedSeconds) };
        String sortOrder = MediaStore.Audio.Media.DATE_MODIFIED + " DESC";

        try (
            Cursor cursor = resolver.query(
                collection,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )
        ) {
            if (cursor == null) {
                return null;
            }

            SystemRecordingCandidate bestCandidate = null;
            int bestScore = 0;
            int scanned = 0;

            while (cursor.moveToNext() && scanned < 80) {
                scanned++;
                SystemRecordingCandidate candidate = readSystemRecordingCandidate(cursor);

                if (candidate == null || candidate.sizeBytes < MIN_RECORDING_FILE_BYTES) {
                    continue;
                }

                int score = scoreSystemRecordingCandidate(candidate, durationSeconds);

                if (score > bestScore) {
                    bestScore = score;
                    bestCandidate = candidate;
                }
            }

            return bestScore >= 7 ? bestCandidate : null;
        }
    }

    private String[] getSystemRecordingProjection() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return new String[] {
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.MIME_TYPE,
                MediaStore.Audio.Media.SIZE,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.DATE_MODIFIED,
                MediaStore.Audio.Media.RELATIVE_PATH
            };
        }

        return new String[] {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.MIME_TYPE,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATE_MODIFIED
        };
    }

    @Nullable
    private SystemRecordingCandidate readSystemRecordingCandidate(Cursor cursor) {
        int idColumn = cursor.getColumnIndex(MediaStore.Audio.Media._ID);
        int nameColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DISPLAY_NAME);
        int mimeColumn = cursor.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE);
        int sizeColumn = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);
        int durationColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
        int dateModifiedColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DATE_MODIFIED);
        int relativePathColumn = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? cursor.getColumnIndex(MediaStore.Audio.Media.RELATIVE_PATH)
            : -1;

        if (idColumn < 0 || sizeColumn < 0 || dateModifiedColumn < 0) {
            return null;
        }

        long id = cursor.getLong(idColumn);
        Uri uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);

        return new SystemRecordingCandidate(
            uri,
            nameColumn >= 0 ? cursor.getString(nameColumn) : "",
            mimeColumn >= 0 ? cursor.getString(mimeColumn) : "",
            sizeColumn >= 0 ? cursor.getLong(sizeColumn) : 0L,
            durationColumn >= 0 ? cursor.getLong(durationColumn) : 0L,
            dateModifiedColumn >= 0 ? cursor.getLong(dateModifiedColumn) : 0L,
            relativePathColumn >= 0 ? cursor.getString(relativePathColumn) : ""
        );
    }

    private int scoreSystemRecordingCandidate(SystemRecordingCandidate candidate, int durationSeconds) {
        String haystack = (
            safeLower(candidate.displayName) +
            " " +
            safeLower(candidate.relativePath)
        );
        int score = 0;

        if (
            haystack.contains("call") ||
            haystack.contains("record") ||
            haystack.contains("recorder") ||
            haystack.contains("phone") ||
            haystack.contains("通话") ||
            haystack.contains("电话") ||
            haystack.contains("录音")
        ) {
            score += 8;
        }

        String phoneDigits = digitsOnly(phone);
        if (phoneDigits.length() >= 4 && digitsOnly(candidate.displayName).contains(phoneDigits.substring(phoneDigits.length() - 4))) {
            score += 6;
        }

        if (candidate.dateModifiedSeconds >= Math.max(0L, (callConnectedAtMs - 10_000L) / 1000L)) {
            score += 4;
        }

        if (durationSeconds > 0 && candidate.durationMs > 0L) {
            long diffSeconds = Math.abs((candidate.durationMs / 1000L) - durationSeconds);

            if (diffSeconds <= 8L) {
                score += 6;
            } else if ((candidate.durationMs / 1000L) >= Math.max(1, durationSeconds - 15)) {
                score += 3;
            }
        }

        return score;
    }

    private RecordingPayload copySystemRecordingToInternalFile(SystemRecordingCandidate candidate) throws IOException {
        File directory = new File(getFilesDir(), "call-recordings");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("无法创建本地录音目录。");
        }

        String mimeType = inferMimeType(candidate.displayName, candidate.mimeType);
        String extension = extensionForRecording(candidate.displayName, mimeType);
        File target = new File(
            directory,
            "system-" + callRecordId + "-" + System.currentTimeMillis() + "." + extension
        );

        try (
            InputStream inputStream = getContentResolver().openInputStream(candidate.uri);
            OutputStream outputStream = new FileOutputStream(target)
        ) {
            if (inputStream == null) {
                throw new IOException("无法读取系统通话录音。");
            }

            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, read);
            }
        }

        if (target.length() < MIN_RECORDING_FILE_BYTES) {
            deleteQuietly(target);
            throw new IOException("系统通话录音文件为空。");
        }

        return new RecordingPayload(target, mimeType, codecForMimeType(mimeType, extension), true);
    }

    private void releaseRecorderQuietly(@Nullable MediaRecorder candidateRecorder) {
        if (candidateRecorder == null) {
            return;
        }

        try {
            candidateRecorder.stop();
        } catch (Exception ignored) {
        }

        try {
            candidateRecorder.release();
        } catch (Exception ignored) {
        }
    }

    private File stopRecorderQuietly() {
        if (recorder != null) {
            try {
                recorder.stop();
            } catch (Exception ignored) {
            }

            try {
                recorder.release();
            } catch (Exception ignored) {
            }

            recorder = null;
        }

        return outputFile;
    }

    @SuppressWarnings("deprecation")
    private void enableSpeakerphoneForCapture() {
        if (!forceSpeakerphone) {
            return;
        }

        try {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

            if (audioManager == null) {
                return;
            }

            previousSpeakerphoneOn = audioManager.isSpeakerphoneOn();

            if (!previousSpeakerphoneOn) {
                audioManager.setSpeakerphoneOn(true);
                speakerphoneChanged = true;
            }
        } catch (Exception ignored) {
        }
    }

    @SuppressWarnings("deprecation")
    private void restoreAudioRoutingQuietly() {
        try {
            if (audioManager != null && speakerphoneChanged) {
                audioManager.setSpeakerphoneOn(previousSpeakerphoneOn);
            }
        } catch (Exception ignored) {
        } finally {
            speakerphoneChanged = false;
            audioManager = null;
        }
    }

    private void registerPhoneStateListener() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            persistSession("FAILED", "PENDING", null, "缺少通话状态权限。", 0);
            return;
        }

        telephonyManager = (TelephonyManager) getSystemService(Context.TELEPHONY_SERVICE);
        if (telephonyManager == null) {
            persistSession("FAILED", "PENDING", null, "无法监听系统电话状态。", 0);
            return;
        }

        telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE);
    }

    private void unregisterPhoneStateListener() {
        if (telephonyManager == null) {
            return;
        }

        telephonyManager.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE);
        telephonyManager = null;
    }

    private void patchCallEnd(int durationSeconds) throws Exception {
        JSONObject body = new JSONObject();
        body.put("durationSeconds", durationSeconds);
        requestJson("PATCH", "/api/mobile/calls/" + urlEncode(callRecordId) + "/end", body);
    }

    private UploadResult uploadRecording(RecordingPayload recording, int durationSeconds) throws Exception {
        long fileSizeBytes = recording.file.length();
        String fileSha256 = sha256(recording.file);
        int normalizedChunkSize = Math.max(256 * 1024, chunkSizeBytes);
        int totalChunks = (int) Math.ceil(fileSizeBytes / (double) normalizedChunkSize);

        JSONObject body = new JSONObject();
        body.put("callRecordId", callRecordId);
        body.put("deviceId", isBlank(deviceId) ? "" : deviceId);
        body.put("mimeType", recording.mimeType);
        body.put("codec", recording.codec);
        body.put("fileSizeBytes", fileSizeBytes);
        body.put("durationSeconds", durationSeconds);
        body.put("sha256", fileSha256);
        body.put("chunkSizeBytes", normalizedChunkSize);
        body.put("totalChunks", totalChunks);

        JSONObject uploadResponse = requestJson("POST", "/api/mobile/call-recordings/uploads", body);
        JSONObject upload = uploadResponse.getJSONObject("upload");
        String uploadId = upload.getString("id");

        uploadChunks(recording.file, uploadId, normalizedChunkSize);

        JSONObject completed = requestJson(
            "POST",
            "/api/mobile/call-recordings/uploads/" + urlEncode(uploadId) + "/complete",
            null
        );
        JSONObject completedRecording = completed.getJSONObject("recording");
        return new UploadResult(
            completedRecording.optString("recordingId", ""),
            completedRecording.optString("status", "READY")
        );
    }

    private void uploadChunks(File recordingFile, String uploadId, int normalizedChunkSize) throws Exception {
        byte[] buffer = new byte[normalizedChunkSize];
        int index = 0;

        try (BufferedInputStream inputStream = new BufferedInputStream(new FileInputStream(recordingFile))) {
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                byte[] chunk = read == buffer.length ? buffer : Arrays.copyOf(buffer, read);
                putChunk(uploadId, index, chunk, sha256(chunk));
                index++;
            }
        }
    }

    private JSONObject requestJson(String method, String path, @Nullable JSONObject body) throws Exception {
        HttpURLConnection connection = openConnection(method, path);
        connection.setRequestProperty("Accept", "application/json");

        if (body != null) {
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream outputStream = connection.getOutputStream()) {
                outputStream.write(bytes);
            }
        }

        String response = readResponse(connection);
        int status = connection.getResponseCode();
        connection.disconnect();

        if (status < 200 || status >= 300) {
            throw new IOException("CRM 接口失败：" + response);
        }

        return response.isEmpty() ? new JSONObject() : new JSONObject(response);
    }

    private void putChunk(String uploadId, int index, byte[] bytes, String chunkSha256) throws Exception {
        String path = String.format(
            Locale.US,
            "/api/mobile/call-recordings/uploads/%s/chunks/%d",
            urlEncode(uploadId),
            index
        );
        HttpURLConnection connection = openConnection("PUT", path);
        connection.setDoOutput(true);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "audio/mp4");
        connection.setRequestProperty("x-chunk-sha256", chunkSha256);
        connection.setFixedLengthStreamingMode(bytes.length);

        try (OutputStream outputStream = connection.getOutputStream()) {
            outputStream.write(bytes);
        }

        String response = readResponse(connection);
        int status = connection.getResponseCode();
        connection.disconnect();

        if (status < 200 || status >= 300) {
            throw new IOException("录音分片上传失败：" + response);
        }
    }

    private HttpURLConnection openConnection(String method, String path) throws IOException {
        URL url = new URL(apiBaseUrl + path);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(60000);
        String cookies = CookieManager.getInstance().getCookie(apiBaseUrl);
        if (cookies != null && !cookies.trim().isEmpty()) {
            connection.setRequestProperty("Cookie", cookies);
        }
        return connection;
    }

    private String readResponse(HttpURLConnection connection) throws IOException {
        InputStream stream = connection.getResponseCode() >= 400
            ? connection.getErrorStream()
            : connection.getInputStream();

        if (stream == null) {
            return "";
        }

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line);
            }
            return body.toString();
        }
    }

    private void persistSession(
        String status,
        String uploadStatus,
        @Nullable String recordingId,
        @Nullable String failureMessage,
        int durationSeconds
    ) {
        try {
            JSONObject session = new JSONObject();
            session.put("callRecordId", callRecordId);
            session.put("customerId", customerId);
            session.put("customerName", customerName == null ? "" : customerName);
            session.put("phone", phone);
            session.put("deviceId", deviceId == null ? "" : deviceId);
            session.put("recordingStatus", status);
            session.put("uploadStatus", uploadStatus);
            session.put("recordingId", recordingId == null ? JSONObject.NULL : recordingId);
            session.put("failureMessage", failureMessage == null ? JSONObject.NULL : failureMessage);
            session.put("durationSeconds", durationSeconds);
            session.put("audioSource", activeAudioSourceName);
            session.put("forceSpeakerphone", forceSpeakerphone);
            session.put("updatedAt", System.currentTimeMillis());

            String serialized = session.toString();
            SharedPreferences preferences = getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
            preferences
                .edit()
                .putString(LAST_SESSION_KEY, serialized)
                .putString(sessionKey(callRecordId), serialized)
                .apply();

            Intent intent = new Intent(ACTION_SESSION_UPDATED);
            intent.setPackage(getPackageName());
            intent.putExtra(EXTRA_SESSION_JSON, serialized);
            sendBroadcast(intent);
        } catch (Exception ignored) {
        }
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");

        try (InputStream inputStream = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }

        return toHex(digest.digest());
    }

    private String sha256(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return toHex(digest.digest(bytes));
    }

    private String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format(Locale.US, "%02x", value));
        }
        return builder.toString();
    }

    private String trimTrailingSlash(@Nullable String value) {
        if (value == null) {
            return "";
        }

        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String urlEncode(String value) {
        try {
            return URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20");
        } catch (Exception ignored) {
            return value.replace(" ", "%20");
        }
    }

    private boolean isBlank(@Nullable String value) {
        return value == null || value.trim().isEmpty();
    }

    private boolean hasAudioLibraryPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }

        return ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private String safeLower(@Nullable String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private String digitsOnly(@Nullable String value) {
        if (value == null) {
            return "";
        }

        StringBuilder builder = new StringBuilder(value.length());
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);

            if (current >= '0' && current <= '9') {
                builder.append(current);
            }
        }

        return builder.toString();
    }

    private String inferMimeType(@Nullable String displayName, @Nullable String candidateMimeType) {
        String normalizedMimeType = candidateMimeType == null ? "" : candidateMimeType.trim().toLowerCase(Locale.ROOT);

        if (normalizedMimeType.startsWith("audio/")) {
            return normalizedMimeType;
        }

        String lowerName = safeLower(displayName);

        if (lowerName.endsWith(".mp3")) {
            return "audio/mpeg";
        }

        if (lowerName.endsWith(".amr")) {
            return "audio/amr";
        }

        if (lowerName.endsWith(".wav")) {
            return "audio/wav";
        }

        if (lowerName.endsWith(".aac")) {
            return "audio/aac";
        }

        return "audio/mp4";
    }

    private String extensionForRecording(@Nullable String displayName, String mimeType) {
        String lowerName = safeLower(displayName);
        int dotIndex = lowerName.lastIndexOf('.');

        if (dotIndex >= 0 && dotIndex < lowerName.length() - 1) {
            String extension = lowerName.substring(dotIndex + 1).replaceAll("[^a-z0-9]", "");

            if (!extension.isEmpty() && extension.length() <= 8) {
                return extension;
            }
        }

        if (mimeType.contains("mpeg") || mimeType.contains("mp3")) {
            return "mp3";
        }

        if (mimeType.contains("amr")) {
            return "amr";
        }

        if (mimeType.contains("wav")) {
            return "wav";
        }

        if (mimeType.contains("aac")) {
            return "aac";
        }

        return "m4a";
    }

    private String codecForMimeType(String mimeType, String extension) {
        String normalized = (mimeType + " " + extension).toLowerCase(Locale.ROOT);

        if (normalized.contains("mpeg") || normalized.contains("mp3")) {
            return "mp3";
        }

        if (normalized.contains("amr")) {
            return "amr";
        }

        if (normalized.contains("wav")) {
            return "pcm";
        }

        return "aac";
    }

    private void deleteQuietly(File file) {
        try {
            if (file != null && file.exists()) {
                file.delete();
            }
        } catch (Exception ignored) {
        }
    }

    private String audioSourceName(int audioSource) {
        if (audioSource == MediaRecorder.AudioSource.VOICE_COMMUNICATION) {
            return "VOICE_COMMUNICATION";
        }

        if (audioSource == MediaRecorder.AudioSource.MIC) {
            return "MIC";
        }

        if (audioSource == MediaRecorder.AudioSource.VOICE_RECOGNITION) {
            return "VOICE_RECOGNITION";
        }

        if (audioSource == MediaRecorder.AudioSource.DEFAULT) {
            return "DEFAULT";
        }

        return String.valueOf(audioSource);
    }

    private static final class UploadResult {
        final String recordingId;
        final String status;

        UploadResult(String recordingId, String status) {
            this.recordingId = recordingId;
            this.status = status;
        }
    }

    private static final class RecorderStartResult {
        final File file;
        final String audioSourceName;

        RecorderStartResult(File file, String audioSourceName) {
            this.file = file;
            this.audioSourceName = audioSourceName;
        }
    }

    private static final class RecordingPayload {
        final File file;
        final String mimeType;
        final String codec;
        final boolean deleteAfterUpload;

        RecordingPayload(File file, String mimeType, String codec, boolean deleteAfterUpload) {
            this.file = file;
            this.mimeType = mimeType;
            this.codec = codec;
            this.deleteAfterUpload = deleteAfterUpload;
        }
    }

    private static final class SystemRecordingCandidate {
        final Uri uri;
        final String displayName;
        final String mimeType;
        final long sizeBytes;
        final long durationMs;
        final long dateModifiedSeconds;
        final String relativePath;

        SystemRecordingCandidate(
            Uri uri,
            @Nullable String displayName,
            @Nullable String mimeType,
            long sizeBytes,
            long durationMs,
            long dateModifiedSeconds,
            @Nullable String relativePath
        ) {
            this.uri = uri;
            this.displayName = displayName == null ? "" : displayName;
            this.mimeType = mimeType == null ? "" : mimeType;
            this.sizeBytes = sizeBytes;
            this.durationMs = durationMs;
            this.dateModifiedSeconds = dateModifiedSeconds;
            this.relativePath = relativePath == null ? "" : relativePath;
        }
    }
}
