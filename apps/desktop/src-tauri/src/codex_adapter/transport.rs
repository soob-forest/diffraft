use super::protocol::{self, Decoder, Message};
use crate::{
    claude_adapter::{
        process::{self, ProcessSpec},
        process_lease::ProcessLease,
    },
    domain::{
        MAX_RESPONSE_BYTES,
        error::{AppError, ErrorCode},
    },
};
use serde_json::Value;
use std::{
    collections::VecDeque,
    io::{ErrorKind, Read, Write},
    os::fd::AsRawFd,
    path::Path,
    process::{Child, ChildStderr, ChildStdin, ChildStdout},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

const POLL: Duration = Duration::from_millis(5);
const CHUNK_BYTES: usize = 8192;
const MAX_QUEUED_MESSAGES: usize = 1024;

/// A bounded, owned stdio connection. Call close to surface cleanup failures.
pub struct Peer {
    child: Child,
    lease: Option<ProcessLease>,
    input: ChildStdin,
    output: ChildStdout,
    errors: ChildStderr,
    decoder: Decoder,
    messages: VecDeque<Message>,
    deadline: Instant,
    cancelled: Arc<AtomicBool>,
    received: usize,
    close_result: Option<Result<(), AppError>>,
    cleanup: bool,
}

impl Peer {
    pub fn start(
        spec: &ProcessSpec,
        directory: &Path,
        cancelled: Arc<AtomicBool>,
    ) -> Result<Self, AppError> {
        process::validate(spec, b"", &cancelled)?;
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
        let peer = Self {
            input: child.stdin.take().expect("piped stdin"),
            output: child.stdout.take().expect("piped stdout"),
            errors: child.stderr.take().expect("piped stderr"),
            child,
            lease: Some(lease),
            decoder: Decoder::default(),
            messages: VecDeque::new(),
            deadline: Instant::now() + spec.timeout,
            cancelled,
            received: 0,
            close_result: None,
            cleanup: false,
        };
        for fd in [
            peer.input.as_raw_fd(),
            peer.output.as_raw_fd(),
            peer.errors.as_raw_fd(),
        ] {
            nonblocking(fd)?;
        }
        Ok(peer)
    }

    pub fn send(&mut self, bytes: &[u8]) -> Result<(), AppError> {
        self.check()?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(protocol_error());
        }
        let mut offset = 0;
        while offset < bytes.len() {
            self.check()?;
            match self.input.write(&bytes[offset..]) {
                Ok(0) => return Err(disconnected()),
                Ok(count) => offset += count,
                Err(error) if error.kind() == ErrorKind::Interrupted => continue,
                Err(error) if error.kind() == ErrorKind::WouldBlock => {
                    self.pump()?;
                    thread::sleep(POLL);
                }
                Err(_) => return Err(disconnected()),
            }
        }
        Ok(())
    }

    pub fn receive(&mut self) -> Result<Message, AppError> {
        loop {
            self.check()?;
            if let Some(message) = self.messages.pop_front() {
                return Ok(message);
            }
            self.pump()?;
            if self.messages.is_empty() {
                thread::sleep(POLL);
            }
        }
    }

    /// Diagnostic RPC only: asynchronous notifications are discarded, never treated as results.
    pub fn call(&mut self, id: u64, method: &str, params: Value) -> Result<Value, AppError> {
        self.send(&protocol::request(id, method, params)?)?;
        loop {
            match self.receive()? {
                Message::Notification { .. } => continue,
                Message::Error {
                    id: response_id,
                    thread_missing: true,
                    ..
                } if response_id == id && method == "thread/resume" => {
                    return Err(AppError::new(
                        ErrorCode::SessionMissing,
                        "이전 Codex 연결을 찾지 못했습니다. 저장된 작업 대화는 유지됩니다. 다시 실행하면 새 연결을 시작합니다.",
                    ));
                }
                message => return protocol::response(message, id),
            }
        }
    }

    pub fn close(&mut self) -> Result<(), AppError> {
        if let Some(result) = &self.close_result {
            return result.clone();
        }
        let result = process::stop(&mut self.child)
            .and_then(|_| self.lease.take().map_or(Ok(()), ProcessLease::release));
        // A failed stop retains the lease for identity-checked startup recovery.
        // Never signal a reaped process again or turn a release failure into success.
        self.close_result = Some(result.clone());
        result
    }

    pub(crate) fn cleanup_window(&mut self, timeout: Duration) {
        self.cleanup = true;
        self.deadline = Instant::now() + timeout;
    }

    fn check(&self) -> Result<(), AppError> {
        if self.close_result.is_some() {
            return Err(disconnected());
        }
        if !self.cleanup && self.cancelled.load(Ordering::Acquire) {
            return Err(AppError::new(
                ErrorCode::Cancelled,
                "Codex 요청을 중단했습니다.",
            ));
        }
        if Instant::now() >= self.deadline {
            return Err(AppError::new(
                ErrorCode::NetworkError,
                "Codex 응답 대기 시간이 초과되었습니다.",
            ));
        }
        Ok(())
    }

    fn pump(&mut self) -> Result<(), AppError> {
        let mut buffer = [0; CHUNK_BYTES];
        self.drain_errors(&mut buffer)?;
        match self.output.read(&mut buffer) {
            Ok(0) => {
                self.decoder.finish()?;
                Err(disconnected())
            }
            Ok(count) => {
                self.count(count)?;
                let messages = self.decoder.push(&buffer[..count])?;
                if self.messages.len() + messages.len() > MAX_QUEUED_MESSAGES {
                    return Err(protocol_error());
                }
                self.messages.extend(messages);
                Ok(())
            }
            Err(error)
                if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::Interrupted) =>
            {
                Ok(())
            }
            Err(_) => Err(disconnected()),
        }
    }

    fn drain_errors(&mut self, buffer: &mut [u8]) -> Result<(), AppError> {
        loop {
            self.check()?;
            match self.errors.read(buffer) {
                Ok(0) => return Ok(()),
                Ok(count) => self.count(count)?,
                Err(error) if error.kind() == ErrorKind::Interrupted => continue,
                Err(error) if error.kind() == ErrorKind::WouldBlock => return Ok(()),
                Err(_) => return Err(disconnected()),
            }
        }
    }

    fn count(&mut self, count: usize) -> Result<(), AppError> {
        self.received = self.received.saturating_add(count);
        if self.received > MAX_RESPONSE_BYTES {
            return Err(protocol_error());
        }
        Ok(())
    }
}

impl Drop for Peer {
    fn drop(&mut self) {
        // On failure the process lease remains, so startup recovery blocks unsafe reuse.
        let _ = self.close();
    }
}

fn nonblocking(fd: i32) -> Result<(), AppError> {
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err(disconnected());
    }
    Ok(())
}

fn disconnected() -> AppError {
    AppError::new(
        ErrorCode::NetworkError,
        "Codex 연결이 종료되었습니다. 이전 후보를 유지했습니다.",
    )
}

fn protocol_error() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "Codex 출력이 허용 범위를 초과하거나 올바르지 않습니다.",
    )
}
