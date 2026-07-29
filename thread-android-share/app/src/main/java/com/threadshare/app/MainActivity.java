package com.threadshare.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String TAG = "ThreadShare";
    private static final String PREFS_NAME = "thread_share_settings";
    private static final String API_BASE_URL_KEY = "mirror_server_url";
    private static final String QUEUE_KEY = "mirror_queue";
    private static final String SCHEDULE_ENABLED_KEY = "schedule_enabled";
    private static final String DEFAULT_API_BASE_URL = "http://100.74.184.62:3131";
    private static final Pattern THREADS_POST_URL = Pattern.compile(
            "https?://(?:www\\.)?threads\\.(?:com|net)/@([^\\s/?#]+)/post/([^\\s/?#]+)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern THREADS_SHORT_URL = Pattern.compile(
            "https?://(?:www\\.)?threads\\.(?:com|net)/t/([^\\s/?#]+)",
            Pattern.CASE_INSENSITIVE
    );

    private final ShareTargetConfig shareConfig =
            ShareTargetConfig.fromBuildMode(BuildConfig.SHARE_MODE);
    private TextView titleText;
    private EditText serverUrlInput;
    private EditText threadUrlInput;
    private Button submitButton;
    private TextView statusText;
    private TextView sharedUrlText;
    private ProgressBar progressBar;
    private Handler handler;
    private volatile boolean posting;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handler = new Handler(Looper.getMainLooper());
        clearOldManagedState();
        setContentView(buildContentView());
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        updateActionLabels();
        handleIntent(intent);
    }

    private View buildContentView() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        scrollView.setBackgroundColor(Color.WHITE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(20), dp(22), dp(20), dp(20));
        root.setLayoutParams(new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        scrollView.addView(root);

        titleText = new TextView(this);
        titleText.setTextColor(Color.rgb(15, 20, 25));
        titleText.setTextSize(22);
        titleText.setGravity(Gravity.START);
        root.addView(titleText, matchWrap());

        TextView serverLabel = label("대시보드 서버 URL");
        root.addView(serverLabel, topMargin(matchWrap(), 22));

        serverUrlInput = new EditText(this);
        serverUrlInput.setSingleLine(true);
        serverUrlInput.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        serverUrlInput.setText(prefs.getString(API_BASE_URL_KEY, DEFAULT_API_BASE_URL));
        root.addView(serverUrlInput, matchWrap());

        TextView sharedLabel = label("공유 URL");
        root.addView(sharedLabel, topMargin(matchWrap(), 18));

        threadUrlInput = new EditText(this);
        threadUrlInput.setSingleLine(false);
        threadUrlInput.setMinLines(2);
        threadUrlInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        threadUrlInput.setHint("Threads 원글 URL 입력");
        root.addView(threadUrlInput, matchWrap());

        submitButton = new Button(this);
        submitButton.setAllCaps(false);
        submitButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                submitTypedUrl();
            }
        });
        root.addView(submitButton, topMargin(matchWrap(), 10));

        sharedUrlText = new TextView(this);
        sharedUrlText.setTextColor(Color.rgb(83, 100, 113));
        sharedUrlText.setTextSize(14);
        sharedUrlText.setTextIsSelectable(true);
        root.addView(sharedUrlText, matchWrap());

        progressBar = new ProgressBar(this);
        progressBar.setVisibility(View.GONE);
        root.addView(progressBar, topMargin(wrapWrap(), 18));

        statusText = new TextView(this);
        statusText.setTextColor(Color.rgb(15, 20, 25));
        statusText.setTextSize(15);
        root.addView(statusText, topMargin(matchWrap(), 16));

        updateActionLabels();
        setStatus(shareConfig.idleStatus, true);
        return scrollView;
    }

    private void clearOldManagedState() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .remove(QUEUE_KEY)
                .remove(SCHEDULE_ENABLED_KEY)
                .apply();
    }

    private void handleIntent(Intent intent) {
        if (intent == null
                || (!Intent.ACTION_SEND.equals(intent.getAction())
                && !Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()))) {
            sharedUrlText.setText("");
            setLoading(false);
            setStatus(shareConfig.idleStatus, true);
            return;
        }
        String threadUrl = extractThreadUrlFromIntent(intent);
        if (threadUrl == null) {
            sharedUrlText.setText("");
            setLoading(false);
            setStatus("공유 텍스트에서 Threads 원글 URL을 찾지 못했습니다.", false);
            return;
        }
        threadUrlInput.setText(threadUrl);
        postImmediately(threadUrl, true);
    }

    private void submitTypedUrl() {
        String threadUrl = normalizeThreadUrl(threadUrlInput.getText().toString());
        if (threadUrl == null) {
            sharedUrlText.setText("");
            setLoading(false);
            setStatus("Threads 원글 URL을 입력해 주세요.", false);
            return;
        }
        postImmediately(threadUrl, false);
    }

    private void postImmediately(String threadUrl, boolean finishOnSuccess) {
        if (posting) {
            setStatus("이미 서버로 전송 중입니다.", true);
            return;
        }
        posting = true;
        String apiBaseUrl = normalizeApiBaseUrl(serverUrlInput.getText().toString());
        serverUrlInput.setText(apiBaseUrl);
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(API_BASE_URL_KEY, apiBaseUrl)
                .apply();

        sharedUrlText.setText(threadUrl);
        setLoading(true);
        submitButton.setEnabled(false);
        setStatus(shareConfig.sendingStatus, true);

        new Thread(new Runnable() {
            @Override
            public void run() {
                final MirrorResult result = postMirrorRequest(apiBaseUrl, threadUrl);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        posting = false;
                        setLoading(false);
                        submitButton.setEnabled(true);
                        setStatus(currentStatusMessage(result), result.ok || result.duplicate);
                        if (finishOnSuccess && (result.ok || result.duplicate)) {
                            handler.postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    if (!isFinishing()) {
                                        finish();
                                    }
                                }
                            }, 700);
                        }
                    }
                });
            }
        }).start();
    }

    private MirrorResult postMirrorRequest(String apiBaseUrl, String threadUrl) {
        HttpURLConnection connection = null;
        try {
            String resolvedThreadUrl = resolveThreadUrlForServer(threadUrl);
            URL endpoint = new URL(apiBaseUrl + shareConfig.endpointPath);
            connection = (HttpURLConnection) endpoint.openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(12000);
            connection.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("url", resolvedThreadUrl);
            body.put("origin", shareConfig.origin);

            try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(connection.getOutputStream(), StandardCharsets.UTF_8))) {
                writer.write(body.toString());
            }

            int status = connection.getResponseCode();
            String responseText = readStream(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            JSONObject response = responseText.isEmpty() ? new JSONObject() : new JSONObject(responseText);
            if (status == 409) {
                return MirrorResult.duplicate();
            }
            if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
                return MirrorResult.error(response.optString("error", shareConfig.failureMessage(status)));
            }
            return MirrorResult.success(response.optString("message", shareConfig.successMessage));
        } catch (Exception error) {
            return MirrorResult.error("대시보드 서버 연결 실패: " + error.getMessage());
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String currentStatusMessage(MirrorResult result) {
        if (result.ok) {
            return result.message == null || result.message.isEmpty() ? shareConfig.successMessage : result.message;
        }
        if (result.duplicate) return "이미 처리된 공유입니다.";
        return result.message;
    }

    private void updateActionLabels() {
        if (titleText != null) {
            titleText.setText(shareConfig.title);
        }
        if (submitButton != null) {
            submitButton.setText(shareConfig.buttonText);
        }
    }

    private void setLoading(boolean loading) {
        progressBar.setVisibility(loading ? View.VISIBLE : View.GONE);
    }

    private void setStatus(String text, boolean normal) {
        statusText.setText(text);
        statusText.setTextColor(normal ? Color.rgb(15, 20, 25) : Color.rgb(180, 35, 24));
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private String resolveThreadUrlForServer(String threadUrl) throws Exception {
        String canonicalUrl = normalizeCanonicalThreadUrl(threadUrl);
        if (canonicalUrl != null) return canonicalUrl;

        Matcher shortMatcher = THREADS_SHORT_URL.matcher(threadUrl == null ? "" : threadUrl);
        if (!shortMatcher.find()) {
            throw new IllegalArgumentException("Threads 원글 또는 단축 공유 URL 형식이 아닙니다.");
        }
        String shortUrl = "https://www.threads.com/t/" + shortMatcher.group(1);
        HttpURLConnection resolver = null;
        try {
            resolver = (HttpURLConnection) new URL(shortUrl).openConnection();
            resolver.setInstanceFollowRedirects(true);
            resolver.setRequestMethod("GET");
            resolver.setRequestProperty("Accept", "text/html,application/xhtml+xml");
            // Threads serves a non-redirecting app shell to mobile browser UAs,
            // while generic HTTP clients receive the canonical post redirect.
            resolver.setRequestProperty("User-Agent", "curl/8.7.1");
            resolver.setConnectTimeout(8000);
            resolver.setReadTimeout(12000);

            int status = resolver.getResponseCode();
            canonicalUrl = normalizeCanonicalThreadUrl(resolver.getURL().toString());
            if (canonicalUrl != null) {
                Log.i(TAG, "Resolved Threads short URL to " + canonicalUrl);
                return canonicalUrl;
            }

            String location = resolver.getHeaderField("Location");
            canonicalUrl = normalizeCanonicalThreadUrl(location);
            if (canonicalUrl != null) return canonicalUrl;

            InputStream stream = status >= 400 ? resolver.getErrorStream() : resolver.getInputStream();
            String body = readStream(stream).replace("\\/", "/").replace("&amp;", "&");
            canonicalUrl = normalizeCanonicalThreadUrl(body);
            if (canonicalUrl != null) return canonicalUrl;
            throw new IllegalStateException("Threads 단축 공유 URL을 원문 URL로 변환하지 못했습니다. HTTP " + status);
        } finally {
            if (resolver != null) resolver.disconnect();
        }
    }

    private TextView label(String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextColor(Color.rgb(83, 100, 113));
        label.setTextSize(13);
        return label;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams wrapWrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams topMargin(LinearLayout.LayoutParams params, int marginDp) {
        params.topMargin = dp(marginDp);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String extractThreadUrlFromIntent(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return null;

        LinkedHashSet<String> candidates = new LinkedHashSet<>();
        Bundle extras = intent.getExtras();
        if (extras != null) {
            addShareCandidate(candidates, extras.get(Intent.EXTRA_TEXT));
            addShareCandidate(candidates, extras.get(Intent.EXTRA_TITLE));
            addShareCandidate(candidates, extras.get(Intent.EXTRA_STREAM));
        }
        addShareCandidate(candidates, intent.getCharSequenceExtra(Intent.EXTRA_TEXT));
        addShareCandidate(candidates, intent.getCharSequenceExtra(Intent.EXTRA_TITLE));
        addShareCandidate(candidates, intent.getDataString());

        ClipData clipData = intent.getClipData();
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index += 1) {
                ClipData.Item item = clipData.getItemAt(index);
                addShareCandidate(candidates, item.getText());
                addShareCandidate(candidates, item.getHtmlText());
                addShareCandidate(candidates, item.getUri());
                Intent nestedIntent = item.getIntent();
                if (nestedIntent != null) {
                    addShareCandidate(candidates, nestedIntent.getDataString());
                    Bundle nestedExtras = nestedIntent.getExtras();
                    if (nestedExtras != null) {
                        addShareCandidate(candidates, nestedExtras.get(Intent.EXTRA_TEXT));
                        addShareCandidate(candidates, nestedExtras.get(Intent.EXTRA_TITLE));
                    }
                }
            }
        }

        for (String candidate : candidates) {
            String normalized = normalizeThreadUrl(candidate);
            if (normalized != null) {
                Log.i(TAG, "Accepted Threads share URL " + normalized);
                return normalized;
            }
        }
        Log.w(TAG, "No Threads URL found in share candidates " + candidates);
        return null;
    }

    private static void addShareCandidate(LinkedHashSet<String> candidates, Object value) {
        if (value == null) return;
        String text = String.valueOf(value).trim();
        if (!text.isEmpty()) candidates.add(text);
    }

    static String normalizeThreadUrl(String text) {
        String canonicalUrl = normalizeCanonicalThreadUrl(text);
        if (canonicalUrl != null) return canonicalUrl;
        if (text == null) return null;
        Matcher matcher = THREADS_SHORT_URL.matcher(text);
        if (!matcher.find()) return null;
        return "https://www.threads.com/t/" + matcher.group(1);
    }

    private static String normalizeCanonicalThreadUrl(String text) {
        if (text == null) return null;
        Matcher matcher = THREADS_POST_URL.matcher(text);
        if (!matcher.find()) return null;
        return "https://www.threads.com/@" + matcher.group(1) + "/post/" + matcher.group(2);
    }

    private static String normalizeApiBaseUrl(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            normalized = DEFAULT_API_BASE_URL;
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private static class MirrorResult {
        final boolean ok;
        final boolean duplicate;
        final String message;

        private MirrorResult(boolean ok, boolean duplicate, String message) {
            this.ok = ok;
            this.duplicate = duplicate;
            this.message = message;
        }

        static MirrorResult success(String message) {
            return new MirrorResult(true, false, message);
        }

        static MirrorResult duplicate() {
            return new MirrorResult(false, true, null);
        }

        static MirrorResult error(String message) {
            return new MirrorResult(false, false, message);
        }
    }
}
