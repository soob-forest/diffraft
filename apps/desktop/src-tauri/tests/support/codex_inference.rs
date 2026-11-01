use docreview_core::{
    claude_adapter::process::ProcessSpec,
    codex_adapter::{isolation, profile, transport::Peer},
};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::Path,
    sync::{Arc, atomic::AtomicBool},
    thread::JoinHandle,
    time::{Duration, Instant},
};

pub fn inference(config: &Value) -> (Value, JoinHandle<Value>) {
    let server = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = server.local_addr().unwrap().port();
    let mut config = config.clone();
    config["model_provider"] = json!("fixture");
    config["model_providers"] = json!({"fixture":{"name":"fixture","base_url":format!("http://127.0.0.1:{port}/v1"),"wire_api":"responses","requires_openai_auth":false,"request_max_retries":0}});
    (config, std::thread::spawn(move || capture(server)))
}

pub fn peer(home: &Path, directory: &Path, config: &Value) -> Peer {
    let spec = ProcessSpec {
        program: std::env::var_os("DOCREVIEW_CODEX_BIN")
            .expect("explicit Codex binary")
            .into(),
        args: profile::arguments(Some(config)).unwrap(),
        directory: directory.into(),
        timeout: Duration::from_secs(20),
        environment: std::collections::BTreeMap::from([
            ("HOME".into(), home.into()),
            ("CODEX_HOME".into(), home.into()),
            ("PATH".into(), "/usr/bin:/bin".into()),
        ]),
    };
    let mut peer = Peer::start(
        &isolation::isolate(&spec).unwrap(),
        directory,
        Arc::new(AtomicBool::new(false)),
    )
    .unwrap();
    peer.call(1,"initialize",json!({"clientInfo":{"name":"docreview_fixture","version":"0.1.0"},"capabilities":{"experimentalApi":true}})).unwrap();
    peer.send(b"{\"method\":\"initialized\"}\n").unwrap();
    peer
}

fn capture(listener: TcpListener) -> Value {
    listener.set_nonblocking(true).unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut socket = loop {
        match listener.accept() {
            Ok((socket, _)) => break socket,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                assert!(Instant::now() < deadline, "inference request not observed");
                std::thread::sleep(Duration::from_millis(5));
            }
            Err(_) => panic!("loopback fixture failed"),
        }
    };
    socket
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    let body = read_request(&mut socket);
    socket.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 45\r\nConnection: close\r\n\r\n{\"error\":{\"message\":\"synthetic fixture end\"}}").unwrap();
    serde_json::from_slice(&body).unwrap()
}

fn read_request(socket: &mut TcpStream) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 8192];
    loop {
        let count = socket.read(&mut buffer).unwrap();
        assert!(count > 0);
        bytes.extend_from_slice(&buffer[..count]);
        assert!(bytes.len() <= 2 * 1024 * 1024, "fixture request too large");
        if let Some(index) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
            let headers = std::str::from_utf8(&bytes[..index]).unwrap();
            let size = headers
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|value| value.trim().parse::<usize>().unwrap())
                })
                .expect("content length");
            if bytes.len() >= index + 4 + size {
                return bytes[index + 4..index + 4 + size].to_vec();
            }
        }
    }
}
