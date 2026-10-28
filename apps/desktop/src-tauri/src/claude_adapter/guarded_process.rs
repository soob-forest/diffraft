use super::{
    process::{self, ProcessOutput, ProcessSpec},
    process_lease::ProcessLease,
};
use crate::domain::error::AppError;
use std::{
    path::Path,
    sync::{Arc, atomic::AtomicBool},
};

pub fn run(
    spec: &ProcessSpec,
    input: &[u8],
    cancelled: Arc<AtomicBool>,
    directory: &Path,
) -> Result<ProcessOutput, AppError> {
    process::validate(spec, input, &cancelled)?;
    let mut lease = ProcessLease::reserve(directory)?;
    let mut child = match process::spawn(spec) {
        Ok(child) => child,
        Err(error) => {
            lease.release()?;
            return Err(error);
        }
    };
    if let Err(error) = lease.attach(child.id()) {
        process::stop(&mut child)?;
        lease.release()?;
        return Err(error);
    }
    let completed = process::run_child(spec, input, cancelled, child);
    if completed.stopped {
        lease.release()?;
    }
    completed.result
}
