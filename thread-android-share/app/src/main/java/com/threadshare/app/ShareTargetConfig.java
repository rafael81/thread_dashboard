package com.threadshare.app;

final class ShareTargetConfig {
    static final String DASHBOARD_MODE = "dashboard";
    static final String AUTO_SCHEDULE_MODE = "autoschedule";

    final boolean autoSchedule;
    final String endpointPath;
    final String origin;
    final String title;
    final String buttonText;
    final String idleStatus;
    final String sendingStatus;
    final String successMessage;
    final String failurePrefix;

    private ShareTargetConfig(
            boolean autoSchedule,
            String endpointPath,
            String origin,
            String title,
            String buttonText,
            String idleStatus,
            String sendingStatus,
            String successMessage,
            String failurePrefix
    ) {
        this.autoSchedule = autoSchedule;
        this.endpointPath = endpointPath;
        this.origin = origin;
        this.title = title;
        this.buttonText = buttonText;
        this.idleStatus = idleStatus;
        this.sendingStatus = sendingStatus;
        this.successMessage = successMessage;
        this.failurePrefix = failurePrefix;
    }

    static ShareTargetConfig fromBuildMode(String mode) {
        if (AUTO_SCHEDULE_MODE.equals(mode)) {
            return new ShareTargetConfig(
                    true,
                    "/api/discovery/auto-schedule-async",
                    "android_share_auto_schedule",
                    "Threads 자동 예약",
                    "자동 예약 접수",
                    "Threads 글을 공유하면 대시보드에 저장하고 자동 예약합니다.",
                    "자동 예약 접수 중...",
                    "자동 예약 접수됨",
                    "자동 예약 접수 실패"
            );
        }
        return new ShareTargetConfig(
                false,
                "/api/discovery/add-url-async",
                "android_share",
                "Threads 발굴 대시보드",
                "대시보드에 추가",
                "Threads 글을 공유하면 발굴 대시보드에 추가합니다.",
                "서버로 전송 중...",
                "대시보드 추가 접수됨",
                "대시보드 추가 실패"
        );
    }

    String failureMessage(int status) {
        return failurePrefix + " (" + status + ")";
    }
}
