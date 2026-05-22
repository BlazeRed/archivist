use axum::Router;
use tower_http::services::ServeDir;

/// Starts a local HTTP file server rooted at the filesystem root.
/// Returns the port it bound to (OS-assigned, loopback only).
pub async fn start() -> u16 {
    let app = Router::new().nest_service("/", ServeDir::new("/"));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("media server: failed to bind");
    let port = listener.local_addr().unwrap().port();
    tauri::async_runtime::spawn(async move {
        axum::serve(listener, app).await.ok();
    });
    port
}
