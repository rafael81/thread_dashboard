package com.threadshare.app;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class ThreadsUrlNormalizer {
    private static final Pattern THREADS_POST_URL = Pattern.compile(
            "https?://(?:www\\.)?threads\\.(?:com|net)/@([^\\s/?#]+)/post/([^\\s/?#]+)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern THREADS_SHORT_URL = Pattern.compile(
            "https?://(?:www\\.)?threads\\.(?:com|net)/t/([^\\s/?#]+)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern THREADS_SHARE_URL = Pattern.compile(
            "https?://(?:www\\.)?threads\\.(?:com|net)/share/([^\\s/?#]+)",
            Pattern.CASE_INSENSITIVE
    );

    private ThreadsUrlNormalizer() {
    }

    static String normalizeSharedUrl(String text) {
        String canonicalUrl = normalizeCanonicalUrl(text);
        if (canonicalUrl != null) return canonicalUrl;
        return normalizeRedirectUrl(text);
    }

    static String normalizeCanonicalUrl(String text) {
        if (text == null) return null;
        Matcher matcher = THREADS_POST_URL.matcher(text);
        if (!matcher.find()) return null;
        return "https://www.threads.com/@" + matcher.group(1) + "/post/" + matcher.group(2);
    }

    static String normalizeRedirectUrl(String text) {
        if (text == null) return null;
        Matcher shortMatcher = THREADS_SHORT_URL.matcher(text);
        if (shortMatcher.find()) {
            return "https://www.threads.com/t/" + shortMatcher.group(1);
        }
        Matcher shareMatcher = THREADS_SHARE_URL.matcher(text);
        if (shareMatcher.find()) {
            return "https://www.threads.com/share/" + shareMatcher.group(1) + "/";
        }
        return null;
    }
}
