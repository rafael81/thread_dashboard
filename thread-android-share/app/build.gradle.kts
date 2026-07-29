plugins {
    id("com.android.application")
}

android {
    namespace = "com.threadshare.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.threadshare"
        minSdk = 26
        targetSdk = 35
        versionCode = 14
        versionName = "0.7.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    flavorDimensions += "shareAction"
    productFlavors {
        create("dashboard") {
            dimension = "shareAction"
            applicationIdSuffix = ".dashboard"
            buildConfigField("String", "SHARE_MODE", "\"dashboard\"")
            resValue("string", "app_name", "대시보드 저장")
        }
        create("autoschedule") {
            dimension = "shareAction"
            applicationIdSuffix = ".autoschedule"
            buildConfigField("String", "SHARE_MODE", "\"autoschedule\"")
            resValue("string", "app_name", "자동 예약")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = false
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
