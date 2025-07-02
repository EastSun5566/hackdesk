// Improved cmd.rs with duplicate prevention for open_link command
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Runtime, State, Window};
use tauri::api::shell;
use serde::{Deserialize, Serialize};
use log::{debug, warn, error};

#[derive(Debug, Serialize, Deserialize)]
struct LinkRequest {
    url: String,
}

#[derive(Debug, Clone)]
struct LinkClickRecord {
    url: String,
    timestamp: Instant,
    window_label: String,
}

// State for tracking recent link clicks to prevent duplicates
#[derive(Debug)]
struct LinkClickTracker {
    recent_clicks: Arc<Mutex<Vec<LinkClickRecord>>>,
    cleanup_interval: Duration,
    duplicate_threshold: Duration,
}

impl LinkClickTracker {
    fn new() -> Self {
        Self {
            recent_clicks: Arc::new(Mutex::new(Vec::new())),
            cleanup_interval: Duration::from_secs(60), // Clean up old records every 60 seconds
            duplicate_threshold: Duration::from_millis(500), // Consider duplicates within 500ms
        }
    }

    fn is_duplicate(&self, url: &str, window_label: &str) -> bool {
        let mut clicks = self.recent_clicks.lock().unwrap();
        let now = Instant::now();
        
        // Clean up old records
        clicks.retain(|record| now.duration_since(record.timestamp) < self.cleanup_interval);
        
        // Check for recent duplicates
        let is_duplicate = clicks.iter().any(|record| {
            record.url == url 
                && record.window_label == window_label
                && now.duration_since(record.timestamp) < self.duplicate_threshold
        });
        
        if !is_duplicate {
            // Record this click
            clicks.push(LinkClickRecord {
                url: url.to_string(),
                timestamp: now,
                window_label: window_label.to_string(),
            });
            
            debug!("Recorded link click: {} from window: {}", url, window_label);
        } else {
            warn!("Duplicate link click detected: {} from window: {} (within {:?})", 
                  url, window_label, self.duplicate_threshold);
        }
        
        is_duplicate
    }
}

#[derive(Debug, Serialize)]
struct CommandResponse {
    success: bool,
    message: String,
    url: Option<String>,
}

#[tauri::command]
pub async fn open_link<R: Runtime>(
    window: Window<R>,
    tracker: State<'_, LinkClickTracker>,
    request: LinkRequest,
) -> Result<CommandResponse, String> {
    let url = request.url.trim();
    let window_label = window.label().to_string();
    
    debug!("open_link command called with URL: {} from window: {}", url, window_label);
    
    // Validate URL format
    if url.is_empty() {
        error!("Empty URL provided");
        return Err("URL cannot be empty".to_string());
    }
    
    // Parse and validate URL
    let parsed_url = match url::Url::parse(url) {
        Ok(parsed) => parsed,
        Err(e) => {
            error!("Invalid URL format: {} - Error: {}", url, e);
            return Err(format!("Invalid URL format: {}", e));
        }
    };
    
    // Security checks
    let allowed_schemes = ["http", "https", "mailto", "tel"];
    if !allowed_schemes.contains(&parsed_url.scheme()) {
        warn!("Blocked potentially unsafe URL scheme: {} for URL: {}", parsed_url.scheme(), url);
        return Err(format!("URL scheme '{}' is not allowed", parsed_url.scheme()));
    }
    
    // Check for duplicates
    if tracker.is_duplicate(url, &window_label) {
        warn!("Duplicate link click prevented for URL: {}", url);
        return Ok(CommandResponse {
            success: false,
            message: "Duplicate link click prevented".to_string(),
            url: Some(url.to_string()),
        });
    }
    
    // Attempt to open the URL
    match shell::open(&window.shell_scope(), url, None) {
        Ok(_) => {
            debug!("Successfully opened URL: {}", url);
            Ok(CommandResponse {
                success: true,
                message: "Link opened successfully".to_string(),
                url: Some(url.to_string()),
            })
        }
        Err(e) => {
            error!("Failed to open URL: {} - Error: {}", url, e);
            Err(format!("Failed to open link: {}", e))
        }
    }
}

// Helper command to check if URL would be allowed (for frontend validation)
#[tauri::command]
pub fn validate_url(url: String) -> Result<bool, String> {
    if url.trim().is_empty() {
        return Ok(false);
    }
    
    match url::Url::parse(&url) {
        Ok(parsed) => {
            let allowed_schemes = ["http", "https", "mailto", "tel"];
            Ok(allowed_schemes.contains(&parsed.scheme()))
        }
        Err(_) => Ok(false),
    }
}

// Command to get link click statistics (for debugging)
#[tauri::command]
pub fn get_link_stats(tracker: State<'_, LinkClickTracker>) -> Result<HashMap<String, usize>, String> {
    let clicks = tracker.recent_clicks.lock().unwrap();
    let now = Instant::now();
    
    let mut url_counts = HashMap::new();
    
    for record in clicks.iter() {
        if now.duration_since(record.timestamp) < tracker.cleanup_interval {
            *url_counts.entry(record.url.clone()).or_insert(0) += 1;
        }
    }
    
    Ok(url_counts)
}

// Command to clear link click history (for debugging/testing)
#[tauri::command]
pub fn clear_link_history(tracker: State<'_, LinkClickTracker>) -> Result<String, String> {
    let mut clicks = tracker.recent_clicks.lock().unwrap();
    let count = clicks.len();
    clicks.clear();
    Ok(format!("Cleared {} link click records", count))
}

// Initialize the link click tracker
pub fn init_link_tracker() -> LinkClickTracker {
    LinkClickTracker::new()
}

// Usage in main.rs:
/*
fn main() {
    tauri::Builder::default()
        .manage(init_link_tracker())
        .invoke_handler(tauri::generate_handler![
            open_link,
            validate_url,
            get_link_stats,
            clear_link_history
        ])
        .setup(|app| {
            // Additional setup if needed
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running HackMD Desktop application");
}
*/