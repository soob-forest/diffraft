use super::Store;
use crate::domain::error::ErrorCode;

#[test]
fn releasing_owner_unlocks_even_while_a_fork_equivalent_descriptor_exists() {
    let directory = tempfile::tempdir().unwrap();
    let owner = Store::open(directory.path()).unwrap();
    // dup and fork reference the same open file description and flock on macOS.
    let inherited = owner._writer_lock.inherited_handle().unwrap();
    assert!(matches!(Store::open(directory.path()), Err(error) if error.code == ErrorCode::Busy));
    drop(owner);
    let reopened = Store::open(directory.path());
    assert!(
        reopened.is_ok(),
        "released Store must relinquish its writer lock"
    );
    drop(inherited);
    assert!(matches!(Store::open(directory.path()), Err(error) if error.code == ErrorCode::Busy));
    drop(reopened);
    assert!(Store::open(directory.path()).is_ok());
}
