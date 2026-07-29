package com.threadshare.app;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ShareTargetConfigTest {
    @Test
    public void dashboardBuildUsesDashboardOnlyEndpoint() {
        ShareTargetConfig config = ShareTargetConfig.fromBuildMode("dashboard");

        assertFalse(config.autoSchedule);
        assertEquals("/api/discovery/add-url-async", config.endpointPath);
        assertEquals("android_share", config.origin);
        assertEquals("대시보드 추가 실패 (500)", config.failureMessage(500));
    }

    @Test
    public void autoScheduleBuildUsesAutoScheduleOnlyEndpoint() {
        ShareTargetConfig config = ShareTargetConfig.fromBuildMode("autoschedule");

        assertTrue(config.autoSchedule);
        assertEquals("/api/discovery/auto-schedule-async", config.endpointPath);
        assertEquals("android_share_auto_schedule", config.origin);
        assertEquals("자동 예약 접수 실패 (429)", config.failureMessage(429));
    }

    @Test
    public void unknownBuildModeFailsSafeToDashboard() {
        ShareTargetConfig config = ShareTargetConfig.fromBuildMode("unexpected");

        assertFalse(config.autoSchedule);
        assertEquals("/api/discovery/add-url-async", config.endpointPath);
    }
}
