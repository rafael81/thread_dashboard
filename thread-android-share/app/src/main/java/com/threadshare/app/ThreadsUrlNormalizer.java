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
    private static final Pattern YOUTUBE_BE_URL = Pattern.compile(
            "https?://(?:www\\.)?youtu\\.be/([A-Za-z0-9_-]{6,})",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern YOUTUBE_WATCH_URL = Pattern.compile(
            "https?://(?:www\\.|m\\.)?youtube\\.com/watch\\?(?:[^\\s]*)\\bv=([A-Za-z0-9_-]{6,})",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern YOUTUBE_SHORTS_URL = Pattern.compile(
            "https?://(?:www\\.|m\\.)?youtube\\.com/shorts/([A-Za-z0-9_-]{6,})",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern YOUTUBE_EMBED_LIVE_URL = Pattern.compile(
            "https?://(?:www\\.|m\\.)?youtube\\.com/(?:embed|live)/([A-Za-z0-9_-]{6,})",
            Pattern.CASE_INSENSITIVE
    );

    private ThreadsUrlNormalizer() {
    }

    static String normalizeSharedUrl(String text) {
        String canonicalUrl = normalizeCanonicalUrl(text);
        if (canonicalUrl != null) return canonicalUrl;
        String redirectUrl = normalizeRedirectUrl(text);
        if (redirectUrl != null) return redirectUrl;
        return normalizeYouTubeUrl(text);
    }

    static String normalizeYouTubeUrl(String text) {
        if (text == null) return null;
        Matcher shorts = YOUTUBE_SHORTS_URL.matcher(text);
        if (shorts.find()) {
            return "https://www.youtube.com/shorts/" + shorts.group(1);
        }
        Matcher watch = YOUTUBE_WATCH_URL.matcher(text);
        if (watch.find()) {
            return "https://www.youtube.com/watch?v=" + watch.group(1);
        }
        Matcher embed = YOUTUBE_EMBED_LIVE_URL.matcher(text);
        if (embed.find()) {
            return "https://www.youtube.com/watch?v=" + embed.group(1);
        }
        Matcher shortLink = YOUTUBE_BE_URL.matcher(text);
        if (shortLink.find()) {
            return "https://www.youtube.com/watch?v=" + shortLink.group(1);
        }
        return null;
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
