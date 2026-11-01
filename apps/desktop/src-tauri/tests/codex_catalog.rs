use docreview_core::{
    codex_adapter::catalog::Catalog,
    domain::{
        error::ErrorCode,
        model::ModelSelection,
        provider::{ProviderModel, ReasoningEffort, validate_provider_id},
    },
};
use serde_json::{Value, json};

fn model(id: &str, default: bool) -> Value {
    json!({"id":id,"model":id,"displayName":"합성 모델","hidden":false,
        "isDefault":default,"defaultReasoningEffort":"medium",
        "supportedReasoningEfforts":[{"reasoningEffort":"medium"},{"reasoningEffort":"low"}]})
}

fn choice(id: &str) -> ProviderModel {
    ProviderModel::Codex {
        model: id.into(),
        effort: ReasoningEffort::Low,
    }
}

#[test]
fn paginated_catalog_resolves_concrete_model_and_supported_effort() {
    let mut catalog = Catalog::default();
    assert_eq!(
        catalog
            .append(json!({"data":[model("fixture-one",false)],"nextCursor":"next"}))
            .unwrap(),
        Some("next".into())
    );
    assert!(catalog.default_model().is_err());
    assert_eq!(
        catalog
            .append(json!({"data":[model("fixture-two",true)],"nextCursor":null}))
            .unwrap(),
        None
    );
    assert_eq!(
        catalog.default_model().unwrap(),
        ProviderModel::Codex {
            model: "fixture-two".into(),
            effort: ReasoningEffort::Medium,
        }
    );
    catalog.validate_choice(&choice("fixture-one")).unwrap();
    assert!(catalog.validate_choice(&choice("unavailable")).is_err());
    assert!(
        catalog
            .append(json!({"data":[],"nextCursor":null}))
            .is_err()
    );
}

#[test]
fn rejects_duplicate_ids_looping_cursors_and_ambiguous_defaults() {
    let mut duplicate = Catalog::default();
    assert!(
        duplicate
            .append(json!({"data":[model("same",true),model("same",false)],"nextCursor":null}))
            .is_err()
    );
    assert!(duplicate.default_model().is_err());
    let mut looping = Catalog::default();
    looping
        .append(json!({"data":[],"nextCursor":"loop"}))
        .unwrap();
    assert!(
        looping
            .append(json!({"data":[],"nextCursor":"loop"}))
            .is_err()
    );
    let mut ambiguous = Catalog::default();
    ambiguous
        .append(json!({"data":[model("one",true),model("two",true)],"nextCursor":null}))
        .unwrap();
    assert!(ambiguous.default_model().is_err());
    assert!(ambiguous.validate_choice(&choice("one")).is_ok());
}

#[test]
fn rejects_invalid_models_unsupported_effort_and_hidden_selection() {
    for field in ["id", "model", "displayName", "defaultReasoningEffort"] {
        let mut invalid = model("fixture", true);
        invalid[field] = "invalid\nvalue".into();
        assert!(
            Catalog::default()
                .append(json!({"data":[invalid],"nextCursor":null}))
                .is_err()
        );
    }
    let mut unsupported = model("fixture", true);
    unsupported["defaultReasoningEffort"] = "high".into();
    assert!(
        Catalog::default()
            .append(json!({"data":[unsupported],"nextCursor":null}))
            .is_err()
    );
    let mut hidden = model("hidden", true);
    hidden["hidden"] = true.into();
    let mut catalog = Catalog::default();
    catalog
        .append(json!({"data":[hidden],"nextCursor":null}))
        .unwrap();
    assert!(catalog.visible().unwrap().is_empty());
    assert!(catalog.default_model().is_err());
    assert!(catalog.validate_choice(&choice("hidden")).is_err());
}

#[test]
fn enforces_catalog_page_model_and_identifier_bounds() {
    let oversized = vec![model("fixture", true); 257];
    assert!(
        Catalog::default()
            .append(json!({"data":oversized,"nextCursor":null}))
            .is_err()
    );
    let mut catalog = Catalog::default();
    for page in 0..16 {
        catalog
            .append(json!({"data":[],"nextCursor":format!("page-{page}")}))
            .unwrap();
    }
    assert!(
        catalog
            .append(json!({"data":[],"nextCursor":null}))
            .is_err()
    );
    for id in ["", "--model", "../file", "a b", "a\0b", "한글"] {
        assert!(validate_provider_id(id).is_err());
    }
    assert!(validate_provider_id(&"a".repeat(129)).is_err());
    assert!(validate_provider_id("thread_opaque-id.1").is_ok());
}

#[test]
fn tagged_models_preserve_claude_and_reject_mixed_provider_shapes() {
    let claude = ProviderModel::Claude {
        model: ModelSelection::Sonnet,
    };
    let encoded = serde_json::to_value(&claude).unwrap();
    assert_eq!(encoded, json!({"provider":"claude","model":"sonnet"}));
    assert_eq!(
        serde_json::from_value::<ProviderModel>(encoded).unwrap(),
        claude
    );
    claude.validate().unwrap();
    for value in [
        json!({"provider":"unknown","model":"sonnet"}),
        json!({"provider":"claude","model":"fixture-gpt"}),
        json!({"provider":"claude","model":"sonnet","effort":"medium"}),
        json!({"provider":"codex","model":"fixture"}),
    ] {
        assert!(serde_json::from_value::<ProviderModel>(value).is_err());
    }
    let invalid = ProviderModel::Codex {
        model: "--flag".into(),
        effort: ReasoningEffort::Low,
    };
    assert!(invalid.validate().is_err());
}

#[test]
fn supported_pinned_effort_survives_a_different_catalog_default() {
    let mut catalog = Catalog::default();
    catalog
        .append(json!({"data":[model("fixture",true)],"nextCursor":null}))
        .unwrap();
    let selected = ProviderModel::Codex {
        model: "fixture".into(),
        effort: ReasoningEffort::Low,
    };
    catalog.validate_choice(&selected).unwrap();
    assert_ne!(catalog.default_model().unwrap(), selected);
    assert!(
        catalog
            .validate_choice(&ProviderModel::Codex {
                model: "fixture".into(),
                effort: ReasoningEffort::High
            })
            .is_err()
    );
}

#[test]
fn unavailable_saved_choice_reports_model_selection_and_keeps_available_catalog() {
    let mut catalog = Catalog::default();
    catalog
        .append(json!({"data":[model("available",true)],"nextCursor":null}))
        .unwrap();
    for (name, effort) in [
        ("retired", ReasoningEffort::Low),
        ("available", ReasoningEffort::Ultra),
    ] {
        let selected = ProviderModel::Codex {
            model: name.into(),
            effort,
        };
        let error = catalog.validate_choice(&selected).unwrap_err();
        assert_eq!(error.code, ErrorCode::CliUnsupported);
        assert!(error.message.contains("선택해 저장"));
        assert_eq!(catalog.visible().unwrap().len(), 1);
        assert_eq!(
            catalog.default_model().unwrap(),
            ProviderModel::Codex {
                model: "available".into(),
                effort: ReasoningEffort::Medium,
            }
        );
    }
}
