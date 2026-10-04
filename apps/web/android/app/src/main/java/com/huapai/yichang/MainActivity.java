package com.huapai.yichang;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 沉浸式全屏。
 *
 * 牌桌是「宽而矮」的版面（横屏 800×360 下限），状态栏 + 手势条会实打实吃掉
 * 纵向空间，所以这里把两条系统栏都隐掉。
 *
 * 为什么必须在原生做：CSS 做不到。viewport-fit=cover + env(safe-area-inset-*)
 * 只能让布局**绕开**系统栏，不能把它**隐藏**；隐藏系统栏必须走窗口 API。
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        hideSystemBars();
    }

    /**
     * 系统栏在失焦、手势、弹窗之后会自己回来，所以每次重新获得焦点都再收一次。
     * 这是 Android 沉浸式模式的标准做法。
     */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    private void hideSystemBars() {
        // 关键一步：让内容延伸到系统栏区域（edge-to-edge）。
        // 只调 hide() 而不设这个，布局仍按「有系统栏」来算，等于白隐。
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        controller.hide(WindowInsetsCompat.Type.systemBars());

        // 上滑可临时调出系统栏，调出后会自动再隐回去 ——
        // 不会把用户困在全屏里，返回手势也仍然可用。
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
