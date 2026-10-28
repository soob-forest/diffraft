fn main() {
    if std::env::var_os("CARGO_FEATURE_DESKTOP").is_some() {
        if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
            let mut build = cc::Build::new();
            build
                .file("native/termination.m")
                .flag("-fobjc-arc")
                .warnings_into_errors(true);
            if std::env::var_os("CARGO_FEATURE_E2E").is_some() {
                build.define("DOCREVIEW_E2E", None);
            }
            build.compile("docreview_termination");
            println!("cargo:rerun-if-changed=native/termination.m");
            println!("cargo:rustc-link-lib=framework=AppKit");
        }
        tauri_build::build();
    }
}
