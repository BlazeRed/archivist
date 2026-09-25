use serde::{Deserialize, Serialize};

/// A photo's GPS coordinates, for the on-device map pin layer. Never leaves
/// the device — the map's tile provider only ever receives z/x/y requests.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageLocation {
    pub id: String,
    pub latitude: f64,
    pub longitude: f64,
}
