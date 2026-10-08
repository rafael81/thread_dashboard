package com.threadshare.app;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public class ThreadsUrlNormalizerTest {
    @Test
    public void acceptsCanonicalPostUrlInsideSharedText() {
        assertEquals(
                "https://www.threads.com/@user.name/post/DbExample1",
                ThreadsUrlNormalizer.normalizeSharedUrl(
                        "이 글을 확인하세요 https://threads.com/@user.name/post/DbExample1?xmt=abc"
                )
        );
    }

    @Test
    public void acceptsLegacyShortShareUrl() {
        assertEquals(
                "https://www.threads.com/t/DbExample2",
                ThreadsUrlNormalizer.normalizeSharedUrl("https://www.threads.com/t/DbExample2")
        );
    }

    @Test
    public void acceptsCurrentShareTokenUrl() {
        assertEquals(
                "https://www.threads.com/share/BAOz5GWDCK/",
                ThreadsUrlNormalizer.normalizeSharedUrl(
                        "https://www.threads.com/share/BAOz5GWDCK/?xmt=ignored"
                )
        );
    }

    @Test
    public void rejectsNonThreadsUrl() {
        assertNull(ThreadsUrlNormalizer.normalizeSharedUrl("https://example.com/share/BAOz5GWDCK"));
    }

    @Test
    public void acceptsYouTubeWatchUrlInsideSharedText() {
        assertEquals(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                ThreadsUrlNormalizer.normalizeSharedUrl(
                        "한국 KF 21하고 미국 F 35 https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share"
                )
        );
    }

    @Test
    public void acceptsYouTubeShortsAndShortLinks() {
        assertEquals(
                "https://www.youtube.com/shorts/Fe44xglvqbg",
                ThreadsUrlNormalizer.normalizeSharedUrl("https://m.youtube.com/shorts/Fe44xglvqbg?si=abc")
        );
        assertEquals(
                "https://www.youtube.com/watch?v=Fe44xglvqbg",
                ThreadsUrlNormalizer.normalizeSharedUrl("제목 보세요 https://youtu.be/Fe44xglvqbg?si=xyz")
        );
    }
}
