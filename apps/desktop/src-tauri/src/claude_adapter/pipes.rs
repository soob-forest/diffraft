use crate::domain::{
    MAX_RESPONSE_BYTES,
    error::{AppError, ErrorCode},
};
use std::{
    io::{ErrorKind, Read, Write},
    os::fd::AsRawFd,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

const READ_CHUNK_BYTES: usize = 8192;
const PIPE_POLL: Duration = Duration::from_millis(5);

pub(super) fn reader(
    mut input: impl Read + AsRawFd + Send + 'static,
    size: Arc<AtomicUsize>,
    done: Arc<AtomicBool>,
) -> JoinHandle<Result<Vec<u8>, AppError>> {
    thread::spawn(move || {
        nonblocking(&input)?;
        let mut output = Vec::new();
        let mut buffer = [0; READ_CHUNK_BYTES];
        loop {
            let count = match input.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => count,
                Err(error) if error.kind() == ErrorKind::Interrupted => continue,
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    if done.load(Ordering::SeqCst) {
                        break;
                    }
                    thread::sleep(PIPE_POLL);
                    continue;
                }
                Err(_) => return Err(pipe_error()),
            };
            let previous = size.fetch_add(count, Ordering::SeqCst);
            if previous.saturating_add(count) > MAX_RESPONSE_BYTES {
                break;
            }
            output.extend_from_slice(&buffer[..count]);
        }
        Ok(output)
    })
}

pub(super) fn writer(
    mut output: impl Write + AsRawFd + Send + 'static,
    input: Vec<u8>,
    done: Arc<AtomicBool>,
) -> JoinHandle<Result<(), AppError>> {
    thread::spawn(move || {
        nonblocking(&output)?;
        let mut offset = 0;
        while offset < input.len() {
            match output.write(&input[offset..]) {
                Ok(0) => return Err(pipe_error()),
                Ok(count) => offset += count,
                Err(error) if error.kind() == ErrorKind::BrokenPipe => return Ok(()),
                Err(error) if error.kind() == ErrorKind::Interrupted => continue,
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    if done.load(Ordering::SeqCst) {
                        return Err(pipe_error());
                    }
                    thread::sleep(PIPE_POLL);
                }
                Err(_) => return Err(pipe_error()),
            }
        }
        Ok(())
    })
}

fn nonblocking(pipe: &impl AsRawFd) -> Result<(), AppError> {
    let fd = pipe.as_raw_fd();
    // Only the owned child's pipe descriptor is changed; it remains open here.
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err(pipe_error());
    }
    Ok(())
}
pub(super) fn join<T>(handle: JoinHandle<Result<T, AppError>>) -> Result<T, AppError> {
    handle.join().map_err(|_| pipe_error())?
}
fn pipe_error() -> AppError {
    AppError::new(
        ErrorCode::UnknownError,
        "CLI 입출력 연결이 중단되었습니다. 이전 후보를 유지했습니다.",
    )
}
