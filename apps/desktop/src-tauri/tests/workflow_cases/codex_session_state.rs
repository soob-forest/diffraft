use crate::{model_selection::request, support::World, world::add_task};
use docreview_core::{
    domain::{
        ai::{AiResponse, ResponseMode},
        conversation::TaskSessionState,
        error::ErrorCode,
        model::ModelSelection,
        provider::{ProviderModel, ReasoningEffort},
        review::ReviewJob,
    },
    storage::codex_execution::CodexExecution,
};

fn record(world: &World, task: &str, account: char, session: Option<&str>) -> ReviewJob {
    let model = ProviderModel::Codex {
        model: "fixture".into(),
        effort: ReasoningEffort::Low,
    };
    let mut input = request(world, task, ModelSelection::CliDefault);
    input.model = model.clone();
    let job = world.store.begin_generation(input).unwrap();
    world
        .store
        .record_codex_execution(
            &job,
            &CodexExecution {
                model,
                mode: ResponseMode::Explain,
                requested_session: session.map(String::from),
                cwd: "/private/fixture".into(),
                cli_version: "0.165.0".into(),
                retry_of: None,
                account_scope: account.to_string().repeat(64),
            },
        )
        .unwrap();
    job
}

fn complete(world: &World, job: &ReviewJob, session: &str) {
    world
        .store
        .complete_explanation(
            job,
            &AiResponse::Explain {
                schema_version: 1,
                answer: "합성 계정 대화".into(),
            },
            session,
        )
        .unwrap();
}

#[test]
fn new_account_without_binding_is_local_even_when_previous_account_is_connected() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let first = record(&world, &task, 'a', None);
    complete(&world, &first, "thread-a");
    let next = record(&world, &task, 'b', None);
    world
        .store
        .finish_failed_job(&next, ErrorCode::RateOrPolicy)
        .unwrap();
    let page = world.store.task_conversation(&task, None).unwrap();
    assert!(matches!(page.session, TaskSessionState::Local));
    assert_eq!(page.messages.len(), 3);
    assert!(
        world
            .store
            .codex_session(&task, &"a".repeat(64))
            .unwrap()
            .is_some()
    );
    assert!(
        world
            .store
            .codex_session(&task, &"b".repeat(64))
            .unwrap()
            .is_none()
    );
}

#[test]
fn missing_and_reselected_accounts_keep_their_own_state_and_other_tasks_do_not_change_it() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    for (account, thread) in [('a', "thread-a"), ('b', "thread-b")] {
        let job = record(&world, &task, account, None);
        complete(&world, &job, thread);
    }
    let missing = record(&world, &task, 'b', Some("thread-b"));
    world
        .store
        .finish_failed_job(&missing, ErrorCode::SessionMissing)
        .unwrap();
    assert!(matches!(
        world.store.task_conversation(&task, None).unwrap().session,
        TaskSessionState::Missing
    ));
    let active = record(&world, &task, 'a', Some("thread-a"));
    world
        .store
        .finish_failed_job(&active, ErrorCode::NetworkError)
        .unwrap();
    let other = add_task(&world, &world.document.id);
    let other_job = record(&world, &other, 'b', None);
    world
        .store
        .finish_failed_job(&other_job, ErrorCode::NetworkError)
        .unwrap();
    assert!(matches!(
        world.store.task_conversation(&task, None).unwrap().session,
        TaskSessionState::Connected
    ));
    assert!(matches!(
        world.store.task_conversation(&other, None).unwrap().session,
        TaskSessionState::Local
    ));
}
