mod model_observation_support;

use docreview_core::domain::model::ModelSelection;
use model_observation_support::{Probe, RETIRED_MODEL};

#[test]
#[ignore = "실제 계정으로 네 모델의 사용 메타데이터를 관측합니다. 명시 실행 전용."]
fn official_cli_reports_model_usage_for_every_selection() {
    for model in [
        ModelSelection::CliDefault,
        ModelSelection::Sonnet,
        ModelSelection::Opus,
        ModelSelection::Haiku,
    ] {
        let probe = Probe::new(model);
        let observed = probe.run();
        assert!(observed.success, "expected a validated structured response");
        assert!(
            observed.models.iter().any(|model| model.output_tokens > 0),
            "expected response model usage metadata"
        );
    }
}

#[test]
#[ignore = "실제 CLI로 과거 모델의 가용성 오류를 관측합니다. 명시 실행 전용."]
fn unavailable_model_fails_without_silently_using_another_model() {
    let mut probe = Probe::new(ModelSelection::Sonnet);
    probe.use_retired_model(false);
    let observed = probe.run();
    assert!(
        !observed.success,
        "unavailable model unexpectedly succeeded"
    );
    assert!(
        observed.unavailable,
        "expected a model availability diagnostic"
    );
    assert!(
        !observed.models.iter().any(|model| model.output_tokens > 0),
        "unexpected output from another model"
    );
}

#[test]
#[ignore = "실제 CLI에만 fallback 모델을 지정해 대체 여부를 관측합니다. 명시 실행 전용."]
fn explicit_cli_fallback_recovers_from_an_unavailable_model() {
    let mut probe = Probe::new(ModelSelection::Sonnet);
    probe.use_retired_model(true);
    let observed = probe.run();
    assert!(
        observed.success,
        "CLI did not recover using the explicit fallback"
    );
    assert!(
        observed.models.iter().any(|model| {
            model.output_tokens > 0 && model.name != RETIRED_MODEL && model.name.contains("haiku")
        }),
        "expected Haiku response usage after the unavailable primary"
    );
}
