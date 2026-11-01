use docreview_core::{
    claude_adapter::process::{self, ProcessSpec},
    codex_adapter::{isolation, profile},
};
use std::{
    collections::BTreeMap,
    path::Path,
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

fn spec(home: &Path, directory: &Path) -> ProcessSpec {
    let mut args: Vec<_> = ["debug", "prompt-input", "Return connected without tools."]
        .map(Into::into)
        .into();
    args.extend(profile::arguments(None).unwrap().into_iter().skip(2));
    ProcessSpec {
        program: std::env::var_os("DOCREVIEW_CODEX_BIN")
            .expect("explicit Codex binary")
            .into(),
        args,
        directory: directory.to_owned(),
        timeout: Duration::from_secs(20),
        environment: BTreeMap::from([
            ("HOME".into(), home.into()),
            ("CODEX_HOME".into(), home.into()),
            ("PATH".into(), "/usr/bin:/bin".into()),
        ]),
    }
}

#[test]
#[ignore = "requires installed Codex; synthetic prompt rendering only, no account or network"]
fn global_guidance_and_symlink_targets_are_not_sent_to_the_model() {
    let root = tempfile::tempdir().unwrap();
    let home = root.path().join("home");
    let work = root.path().join("work");
    std::fs::create_dir(&home).unwrap();
    std::fs::create_dir(&work).unwrap();
    let target = root.path().join("synthetic-guidance.txt");
    std::fs::write(&target, "DOCREVIEW_SYNTHETIC_GUIDANCE_48291").unwrap();
    std::os::unix::fs::symlink(&target, home.join("AGENTS.md")).unwrap();
    let original = spec(&home, &work);
    let output = process::run(&original, b"", Arc::new(AtomicBool::new(false))).unwrap();
    assert!(output.status.success());
    assert!(
        String::from_utf8(output.stdout)
            .unwrap()
            .contains("DOCREVIEW_SYNTHETIC_GUIDANCE_48291")
    );
    let output = process::run(
        &isolation::isolate(&original).unwrap(),
        b"",
        Arc::new(AtomicBool::new(false)),
    )
    .unwrap();
    assert!(output.status.success());
    assert!(
        !String::from_utf8(output.stdout)
            .unwrap()
            .contains("DOCREVIEW_SYNTHETIC_GUIDANCE_48291")
    );
}

#[test]
#[ignore = "requires installed Codex; synthetic skill catalog only, no account or network"]
fn inherited_skill_catalog_is_excluded_from_the_model_context() {
    let root = tempfile::tempdir().unwrap();
    let home = root.path().join("home");
    let work = root.path().join("work");
    let skill = home.join("skills/fixture");
    std::fs::create_dir_all(&skill).unwrap();
    std::fs::create_dir(&work).unwrap();
    std::fs::write(
        skill.join("SKILL.md"),
        "---\nname: fixture\ndescription: DOCREVIEW_SYNTHETIC_SKILL_59201\n---\nNo tools.",
    )
    .unwrap();
    let original = spec(&home, &work);
    let output = process::run(&original, b"", Arc::new(AtomicBool::new(false))).unwrap();
    assert!(output.status.success());
    assert!(
        String::from_utf8(output.stdout)
            .unwrap()
            .contains("DOCREVIEW_SYNTHETIC_SKILL_59201")
    );
    let output = process::run(
        &isolation::isolate(&original).unwrap(),
        b"",
        Arc::new(AtomicBool::new(false)),
    )
    .unwrap();
    assert!(output.status.success());
    assert!(
        !String::from_utf8(output.stdout)
            .unwrap()
            .contains("DOCREVIEW_SYNTHETIC_SKILL_59201")
    );
}
