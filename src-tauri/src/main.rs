#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Mitigate WebView2 startup flicker by setting the initial background
    // before any WebView instance is created.
    unsafe {
        std::env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF070D18");
    }
    mqtt_nexus_lib::run();
}
