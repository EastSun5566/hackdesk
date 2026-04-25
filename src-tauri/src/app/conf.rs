use url::Url;

pub const ROOT: &str = ".hackdesk";
pub const SETTINGS_NAME: &str = "settings.json";

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const COMMAND_PALETTE_WINDOW_LABEL: &str = "command-palette";
pub const AGENT_WINDOW_LABEL: &str = "agent";
pub const SETTINGS_WINDOW_LABEL: &str = "settings";

pub const DEFAULT_TITLE: &str = "HackDesk";
pub const DEFAULT_URL: &str = "https://hackmd.io/login";
pub const DEFAULT_SETTINGS: &str = include_str!("settings.json");
pub const INIT_SCRIPT: &str = include_str!("init.js");

// Window dimensions
pub const COMMAND_PALETTE_WIDTH: f64 = 560.0;
pub const COMMAND_PALETTE_HEIGHT: f64 = 312.0;
pub const AGENT_WINDOW_WIDTH: f64 = 900.0;
pub const AGENT_WINDOW_HEIGHT: f64 = 720.0;
pub const SETTINGS_WINDOW_WIDTH: f64 = 800.0;
pub const SETTINGS_WINDOW_HEIGHT: f64 = 600.0;
pub const MAIN_WINDOW_WIDTH: f64 = 800.0;
pub const MAIN_WINDOW_HEIGHT: f64 = 600.0;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UrlOpenTarget {
    InlineHackmd { path: String },
    External,
}

pub fn is_safe_external_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

pub fn get_inline_hackmd_path(url: &Url) -> Option<String> {
    if url.scheme() != "https" || url.host_str() != Some("hackmd.io") {
        return None;
    }

    let mut path = url.path().to_string();

    if let Some(query) = url.query() {
        path.push('?');
        path.push_str(query);
    }

    if let Some(fragment) = url.fragment() {
        path.push('#');
        path.push_str(fragment);
    }

    Some(path)
}

pub fn classify_url_open_target(url: &Url) -> Option<UrlOpenTarget> {
    if let Some(path) = get_inline_hackmd_path(url) {
        return Some(UrlOpenTarget::InlineHackmd { path });
    }

    if is_safe_external_url(url) {
        return Some(UrlOpenTarget::External);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_hackmd_https_links_for_inline_navigation() {
        let url = Url::parse("https://hackmd.io/@engineering/roadmap?q=quarterly#summary").unwrap();

        assert_eq!(
            classify_url_open_target(&url),
            Some(UrlOpenTarget::InlineHackmd {
                path: "/@engineering/roadmap?q=quarterly#summary".to_string(),
            })
        );
    }

    #[test]
    fn keeps_http_hackmd_links_external() {
        let url = Url::parse("http://hackmd.io/@engineering/roadmap").unwrap();

        assert_eq!(
            classify_url_open_target(&url),
            Some(UrlOpenTarget::External)
        );
    }

    #[test]
    fn keeps_non_hackmd_https_links_external() {
        let url = Url::parse("https://github.com/EastSun5566/hackdesk").unwrap();

        assert_eq!(
            classify_url_open_target(&url),
            Some(UrlOpenTarget::External)
        );
    }

    #[test]
    fn keeps_mailto_links_external() {
        let url = Url::parse("mailto:support@hackmd.io").unwrap();

        assert_eq!(
            classify_url_open_target(&url),
            Some(UrlOpenTarget::External)
        );
    }

    #[test]
    fn rejects_unsupported_schemes() {
        let url = Url::parse("ftp://hackmd.io/roadmap").unwrap();

        assert_eq!(classify_url_open_target(&url), None);
    }
}
