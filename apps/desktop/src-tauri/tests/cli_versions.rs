use docreview_core::claude_adapter::profile;
use docreview_core::domain::{ai::ResponseMode, connection::ConnectionStatus};

const MINIMUM: &str = "2.1.295";
const SESSION: &str = "10000000-0000-4000-8000-000000000001";

fn help() -> String {
    profile::arguments(ResponseMode::Explain, Some(SESSION))
        .unwrap()
        .iter()
        .map(|value| value.to_str().unwrap())
        .collect::<Vec<_>>()
        .join(" ")
}

#[test]
fn accepts_minimum_and_newer_stable_versions_without_an_upper_bound() {
    for version in [MINIMUM, "2.1.311", "2.1.312", "2.1.1000", "2.2.0", "3.0.0"] {
        assert!(profile::supports(version, help().as_bytes()), "{version}");
    }
}

#[test]
fn rejects_older_versions_numerically() {
    for version in ["1.99.999", "2.0.999", "2.1.9", "2.1.100", "2.1.294"] {
        assert!(!profile::supports(version, help().as_bytes()), "{version}");
    }
}

#[test]
fn rejects_malformed_prerelease_overflow_and_noncanonical_versions() {
    for value in [
        "2.1.312-beta.1",
        "2.1.312+build",
        "02.1.312",
        "2.01.312",
        "2.1.0312",
        "2.1",
        "2.1.312.1",
        "2.1.-1",
        "2.1.184467440737095516160",
    ] {
        let output = format!("{value} (Claude Code)\n");
        assert_eq!(profile::version(output.as_bytes()), None, "{value}");
        assert!(!profile::supports(value, help().as_bytes()), "{value}");
    }
}

#[test]
fn newer_versions_still_require_exact_option_tokens() {
    for flag in [
        "--safe-mode",
        "--restricted",
        "--permission-prompts",
        "--resume",
    ] {
        assert!(!profile::supports(
            "2.1.312",
            help().replace(flag, &format!("{flag}-suffix")).as_bytes()
        ));
    }
    assert!(!profile::supports("2.1.312", &[0xff]));
}

#[test]
fn unsupported_report_explains_the_minimum_instead_of_an_exact_pin() {
    let report = profile::report(ConnectionStatus::Unsupported, None, Some("2.1.294".into()));
    assert!(report.message.contains(MINIMUM));
    assert!(!report.message.contains("2.1.311"));
}

#[test]
fn option_probe_accepts_only_bounded_pre_request_errors() {
    let missing = format!(
        "No conversation found with session ID: {}\n",
        profile::OPTION_PROBE_SESSION
    );
    let empty = b"Error: Input must be provided either through stdin or as a prompt argument when using --print\n";
    for error in [missing.as_bytes(), empty] {
        assert!(profile::accepted_option_probe(Some(1), b"", error));
        assert!(!profile::accepted_option_probe(Some(0), b"", error));
        assert!(!profile::accepted_option_probe(
            Some(1),
            b"unexpected output",
            error
        ));
    }
    for error in [
        b"error: unknown option '--restricted'".as_slice(),
        b"network failed",
        &[0xff],
    ] {
        assert!(!profile::accepted_option_probe(Some(1), b"", error));
    }
}
