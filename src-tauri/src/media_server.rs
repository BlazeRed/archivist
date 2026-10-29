use std::sync::Arc;
use axum::extract::{Request, State};
use axum::http::{StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Router;
use serde::Serialize;
use tower_http::services::ServeDir;
use crate::state::AppState;

/// Where the frontend reaches the server: `http://127.0.0.1:{port}/{token}/{path in archive}`.
#[derive(Clone, Serialize)]
pub struct MediaServer {
    pub port: u16,
    pub token: String,
}

/// Starts a local HTTP file server (loopback only, OS-assigned port) for video playback.
/// It serves only the archive open at request time, and only behind a random per-run
/// token: without it, any local user or a web page (via DNS rebinding) could read files.
pub async fn start(state: Arc<AppState>) -> MediaServer {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("media server: no OS randomness");
    let token = hex::encode(bytes);

    let app = Router::new().fallback(serve).with_state((state, token.clone()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("media server: failed to bind");
    let port = listener.local_addr().unwrap().port();
    tauri::async_runtime::spawn(async move {
        axum::serve(listener, app).await.ok();
    });
    MediaServer { port, token }
}

async fn serve(State((state, token)): State<(Arc<AppState>, String)>, req: Request) -> Response {
    let path = req.uri().path().to_string();
    let Some((given, rest)) = path.strip_prefix('/').and_then(|p| p.split_once('/')) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(root) = state.get_archive_path() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !same_token(given, &token) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Ok(uri) = format!("/{rest}").parse::<Uri>() else {
        return StatusCode::BAD_REQUEST.into_response();
    };

    let (mut parts, body) = req.into_parts();
    parts.uri = uri;
    // ServeDir rejects `..` segments, so nothing outside the archive is reachable
    match ServeDir::new(root).try_call(Request::from_parts(parts, body)).await {
        Ok(res) => res.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

/// Constant-time compare: response timing must not reveal how much of a guess matched.
fn same_token(given: &str, token: &str) -> bool {
    given.len() == token.len()
        && given.bytes().zip(token.bytes()).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Only the open archive is served, and only with the token.
    #[test]
    fn serves_archive_files_only_behind_token() {
        let archive = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(archive.path().join("2024")).unwrap();
        std::fs::write(archive.path().join("2024/clip one.mp4"), b"video").unwrap();
        let state = Arc::new(AppState::new(archive.path().join("boot.db")).unwrap());
        state.set_archive_path(archive.path().to_string_lossy().to_string());

        tauri::async_runtime::block_on(async {
            let server = start(state).await;
            let get = |path: String| async move {
                let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", server.port)).await.unwrap();
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                stream.write_all(format!("GET {path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
                let mut out = String::new();
                stream.read_to_string(&mut out).await.unwrap();
                out
            };
            let ok = get(format!("/{}/2024/clip%20one.mp4", server.token)).await;
            assert!(ok.starts_with("HTTP/1.1 200") && ok.ends_with("video"));
            assert!(get("/wrongtoken/2024/clip%20one.mp4".into()).await.starts_with("HTTP/1.1 404"));
            assert!(get(format!("/{}/../../etc/passwd", server.token)).await.starts_with("HTTP/1.1 404"));
            assert!(get("/etc/passwd".into()).await.starts_with("HTTP/1.1 404"));
        });
    }
}
