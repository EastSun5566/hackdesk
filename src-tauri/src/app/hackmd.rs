use std::{fs, io, time::Duration};

use hackmd_api_client_rs::{
    error::{HttpResponseError, TooManyRequestsError},
    ApiClient, ApiClientOptions, ApiError, CreateNoteOptions, Note, NotePermissionRole,
    NotePublishType, RetryOptions, SimpleUserProfile, Team, TeamVisibilityType, User,
};
use serde::{Deserialize, Serialize};

use crate::{app::conf::SETTINGS_NAME, utils};

const HACKMD_TIMEOUT_SECS: u64 = 15;
const HACKMD_RETRY_MAX: u32 = 2;
const HACKMD_RETRY_BASE_DELAY_MS: u64 = 150;

#[derive(Debug)]
pub enum HackmdBridgeError {
    Settings(String),
    Api(ApiError),
}

impl std::fmt::Display for HackmdBridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Settings(message) => write!(f, "{}", message),
            Self::Api(error) => write!(f, "{}", get_hackmd_error_message(error)),
        }
    }
}

impl std::error::Error for HackmdBridgeError {}

impl From<ApiError> for HackmdBridgeError {
    fn from(error: ApiError) -> Self {
        Self::Api(error)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    #[serde(default)]
    hackmd_api_token: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HackmdCreateNoteInput {
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HackmdUserDto {
    pub id: String,
    pub email: Option<String>,
    pub name: String,
    pub user_path: String,
    pub photo: String,
    pub upgraded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HackmdTeamDto {
    pub id: String,
    pub owner_id: Option<String>,
    pub name: String,
    pub logo: String,
    pub path: String,
    pub description: Option<String>,
    pub visibility: String,
    pub created_at: String,
    pub upgraded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HackmdSimpleUserProfileDto {
    pub name: String,
    pub user_path: String,
    pub photo: String,
    pub biography: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HackmdNoteDto {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub last_changed_at: String,
    pub created_at: String,
    pub last_change_user: Option<HackmdSimpleUserProfileDto>,
    pub publish_type: String,
    pub published_at: Option<String>,
    pub user_path: Option<String>,
    pub team_path: Option<String>,
    pub permalink: Option<String>,
    pub short_id: String,
    pub publish_link: String,
    pub read_permission: String,
    pub write_permission: String,
}

impl From<User> for HackmdUserDto {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            name: user.name,
            user_path: user.user_path,
            photo: user.photo,
            upgraded: user.upgraded,
        }
    }
}

impl From<Team> for HackmdTeamDto {
    fn from(team: Team) -> Self {
        Self {
            id: team.id,
            owner_id: team.owner_id,
            name: team.name,
            logo: team.logo,
            path: team.path,
            description: team.description,
            visibility: team_visibility_to_str(&team.visibility).to_string(),
            created_at: team.created_at.to_rfc3339(),
            upgraded: team.upgraded,
        }
    }
}

impl From<SimpleUserProfile> for HackmdSimpleUserProfileDto {
    fn from(user: SimpleUserProfile) -> Self {
        Self {
            name: user.name,
            user_path: user.user_path,
            photo: user.photo,
            biography: user.biography,
        }
    }
}

impl From<Note> for HackmdNoteDto {
    fn from(note: Note) -> Self {
        Self {
            id: note.id,
            title: note.title,
            tags: note.tags,
            last_changed_at: note.last_changed_at.to_rfc3339(),
            created_at: note.created_at.to_rfc3339(),
            last_change_user: note.last_change_user.map(Into::into),
            publish_type: note_publish_type_to_str(&note.publish_type).to_string(),
            published_at: note.published_at.map(|date| date.to_rfc3339()),
            user_path: note.user_path,
            team_path: note.team_path,
            permalink: note.permalink,
            short_id: note.short_id,
            publish_link: note.publish_link,
            read_permission: note_permission_to_str(&note.read_permission).to_string(),
            write_permission: note_permission_to_str(&note.write_permission).to_string(),
        }
    }
}

fn note_publish_type_to_str(publish_type: &NotePublishType) -> &'static str {
    match publish_type {
        NotePublishType::Edit => "edit",
        NotePublishType::View => "view",
        NotePublishType::Slide => "slide",
        NotePublishType::Book => "book",
    }
}

fn team_visibility_to_str(visibility: &TeamVisibilityType) -> &'static str {
    match visibility {
        TeamVisibilityType::Public => "public",
        TeamVisibilityType::Private => "private",
    }
}

fn note_permission_to_str(permission: &NotePermissionRole) -> &'static str {
    match permission {
        NotePermissionRole::Owner => "owner",
        NotePermissionRole::SignedIn => "signed_in",
        NotePermissionRole::Guest => "guest",
    }
}

fn create_hackmd_client(access_token: &str) -> Result<ApiClient, ApiError> {
    ApiClient::with_options(
        access_token.trim(),
        None,
        Some(ApiClientOptions {
            wrap_response_errors: true,
            timeout: Some(Duration::from_secs(HACKMD_TIMEOUT_SECS)),
            retry_options: Some(RetryOptions {
                max_retries: HACKMD_RETRY_MAX,
                base_delay: Duration::from_millis(HACKMD_RETRY_BASE_DELAY_MS),
            }),
        }),
    )
}

fn extract_access_token(content: &str) -> Result<String, HackmdBridgeError> {
    let settings: StoredSettings = serde_json::from_str(content).map_err(|_| {
        HackmdBridgeError::Settings(
            "HackDesk settings could not be read. Please reopen Settings and save again."
                .to_string(),
        )
    })?;

    let access_token = settings.hackmd_api_token.trim();

    if access_token.is_empty() {
        return Err(HackmdBridgeError::Settings(
            "HackMD API token is not configured. Please add it in Settings.".to_string(),
        ));
    }

    Ok(access_token.to_string())
}

fn read_saved_access_token() -> Result<String, HackmdBridgeError> {
    let settings_path = utils::get_root_path(SETTINGS_NAME).map_err(|error| {
        HackmdBridgeError::Settings(format!("HackDesk settings could not be located: {}", error))
    })?;

    let settings_content =
        fs::read_to_string(settings_path).map_err(|error| match error.kind() {
            io::ErrorKind::NotFound => HackmdBridgeError::Settings(
                "HackMD API token is not configured. Please add it in Settings.".to_string(),
            ),
            _ => HackmdBridgeError::Settings(format!(
                "HackDesk settings could not be read: {}",
                error
            )),
        })?;

    extract_access_token(&settings_content)
}

fn get_saved_hackmd_client() -> Result<ApiClient, HackmdBridgeError> {
    let access_token = read_saved_access_token()?;
    create_hackmd_client(&access_token).map_err(Into::into)
}

pub fn get_hackmd_error_message(error: &ApiError) -> String {
    match error {
        ApiError::MissingRequiredArgument(_) => {
            "HackMD API token is not configured. Please add it in Settings.".to_string()
        }
        ApiError::HttpResponse(HttpResponseError { code: 401, .. }) => {
            "Your HackMD API token is invalid or expired.".to_string()
        }
        ApiError::HttpResponse(HttpResponseError { code: 403, .. }) => {
            "Your HackMD API token does not have permission for this action.".to_string()
        }
        ApiError::TooManyRequests(TooManyRequestsError { .. }) => {
            "HackMD is rate limiting requests right now. Please try again in a moment.".to_string()
        }
        ApiError::InternalServer(_) => {
            "HackMD is having trouble right now. Please try again in a moment.".to_string()
        }
        ApiError::Reqwest(request_error) if request_error.is_timeout() => {
            "HackMD took too long to respond. Please try again.".to_string()
        }
        ApiError::Reqwest(_) => {
            "Unable to reach HackMD right now. Please check your network connection.".to_string()
        }
        ApiError::HackMD(error) => error.message.clone(),
        ApiError::HttpResponse(error) => {
            format!("HackMD returned {} {}.", error.code, error.status_text)
        }
        _ => "Something went wrong while talking to HackMD.".to_string(),
    }
}

pub async fn validate_hackmd_token(token: &str) -> Result<HackmdUserDto, HackmdBridgeError> {
    let user = create_hackmd_client(token)?.get_me().await?;
    Ok(user.into())
}

pub async fn list_hackmd_notes() -> Result<Vec<HackmdNoteDto>, HackmdBridgeError> {
    let notes = get_saved_hackmd_client()?.get_note_list().await?;
    Ok(notes.into_iter().map(Into::into).collect())
}

pub async fn list_hackmd_teams() -> Result<Vec<HackmdTeamDto>, HackmdBridgeError> {
    let teams = get_saved_hackmd_client()?.get_teams().await?;
    Ok(teams.into_iter().map(Into::into).collect())
}

pub async fn list_hackmd_team_notes(
    team_path: &str,
) -> Result<Vec<HackmdNoteDto>, HackmdBridgeError> {
    let notes = get_saved_hackmd_client()?.get_team_notes(team_path).await?;
    Ok(notes.into_iter().map(Into::into).collect())
}

pub async fn create_hackmd_note(
    payload: HackmdCreateNoteInput,
) -> Result<HackmdNoteDto, HackmdBridgeError> {
    let note = get_saved_hackmd_client()?
        .create_note(&CreateNoteOptions {
            title: Some(payload.title.trim().to_string()),
            content: Some(payload.content),
            read_permission: None,
            write_permission: None,
            comment_permission: None,
            permalink: None,
        })
        .await?;

    Ok(note.note.into())
}

pub async fn create_hackmd_team_note(
    team_path: &str,
    payload: HackmdCreateNoteInput,
) -> Result<HackmdNoteDto, HackmdBridgeError> {
    let note = get_saved_hackmd_client()?
        .create_team_note(
            team_path,
            &CreateNoteOptions {
                title: Some(payload.title.trim().to_string()),
                content: Some(payload.content),
                read_permission: None,
                write_permission: None,
                comment_permission: None,
                permalink: None,
            },
        )
        .await?;

    Ok(note.note.into())
}

pub async fn delete_hackmd_note(note_id: &str) -> Result<(), HackmdBridgeError> {
    get_saved_hackmd_client()?.delete_note(note_id).await?;
    Ok(())
}

pub async fn delete_hackmd_team_note(
    team_path: &str,
    note_id: &str,
) -> Result<(), HackmdBridgeError> {
    get_saved_hackmd_client()?
        .delete_team_note(team_path, note_id)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use hackmd_api_client_rs::error::{HttpResponseError, TooManyRequestsError};
    use serde_json::json;

    #[test]
    fn extract_access_token_rejects_missing_tokens() {
        let result = extract_access_token(r#"{"hackmdApiToken":"   "}"#);

        assert!(
            matches!(result, Err(HackmdBridgeError::Settings(message)) if message.contains("not configured"))
        );
    }

    #[test]
    fn converts_user_to_frontend_dto() {
        let user: User = serde_json::from_value(json!({
            "id": "user-1",
            "email": "michael@example.com",
            "name": "Michael",
            "userPath": "michael",
            "photo": "https://example.com/photo.png",
            "teams": [],
            "upgraded": true
        }))
        .unwrap();

        let dto = HackmdUserDto::from(user);

        assert_eq!(dto.name, "Michael");
        assert_eq!(dto.user_path, "michael");
        assert!(dto.upgraded);
    }

    #[test]
    fn converts_team_to_frontend_dto() {
        let team: Team = serde_json::from_value(json!({
            "id": "team-1",
            "ownerId": "owner-1",
            "name": "Engineering",
            "logo": "https://example.com/logo.png",
            "path": "engineering",
            "description": "Engineering workspace",
            "hardBreaks": false,
            "visibility": "private",
            "createdAt": 1713398400000u64,
            "upgraded": true
        }))
        .unwrap();

        let dto = HackmdTeamDto::from(team);

        assert_eq!(dto.name, "Engineering");
        assert_eq!(dto.path, "engineering");
        assert_eq!(dto.visibility, "private");
        assert!(dto.created_at.starts_with("2024-04-18"));
    }

    #[test]
    fn converts_note_to_frontend_dto() {
        let note: Note = serde_json::from_value(json!({
            "id": "note-1",
            "title": "Roadmap",
            "tags": ["product"],
            "lastChangedAt": 1713398400000u64,
            "createdAt": 1713398400000u64,
            "lastChangeUser": {
                "name": "Michael",
                "userPath": "michael",
                "photo": "https://example.com/photo.png",
                "biography": null
            },
            "publishType": "edit",
            "publishedAt": null,
            "userPath": "michael",
            "teamPath": null,
            "permalink": "roadmap",
            "shortId": "abc123",
            "publishLink": "https://hackmd.io/abc123",
            "readPermission": "guest",
            "writePermission": "signed_in"
        }))
        .unwrap();

        let dto = HackmdNoteDto::from(note);

        assert_eq!(dto.publish_type, "edit");
        assert_eq!(dto.short_id, "abc123");
        assert_eq!(dto.user_path.as_deref(), Some("michael"));
        assert_eq!(dto.write_permission, "signed_in");
        assert!(dto.last_changed_at.starts_with("2024-04-18"));
    }

    #[test]
    fn maps_unauthorized_errors_to_friendly_message() {
        let error = ApiError::HttpResponse(HttpResponseError {
            message: "Received an error response (401 Unauthorized) from HackMD".to_string(),
            code: 401,
            status_text: "Unauthorized".to_string(),
        });

        assert_eq!(
            get_hackmd_error_message(&error),
            "Your HackMD API token is invalid or expired."
        );
    }

    #[test]
    fn maps_rate_limits_to_friendly_message() {
        let error = ApiError::TooManyRequests(TooManyRequestsError {
            message: "Too many requests (429 Too Many Requests)".to_string(),
            code: 429,
            status_text: "Too Many Requests".to_string(),
            user_limit: 60,
            user_remaining: 0,
            reset_after: Some(120),
        });

        assert_eq!(
            get_hackmd_error_message(&error),
            "HackMD is rate limiting requests right now. Please try again in a moment."
        );
    }
}
