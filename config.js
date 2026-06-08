// Family Board — connection config.
// The anon key is safe to expose in the browser; row access is gated by the app passcode.
export const SUPABASE_URL = "https://yrnlbmdkdtwccqneungl.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmxibWRrZHR3Y2NxbmV1bmdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTk5NDcsImV4cCI6MjA5NjQzNTk0N30.Dbbnp2n-M_BHFU72gDQMF9TJ8boH1nG5ViLaagzh7DU";

// The shared family account. The passcode you choose becomes this account's password,
// and the database only trusts requests signed in as this email — so the passcode is
// enforced by the server, not just hidden in the app.
export const FAMILY_EMAIL = "family@altitude-famboard.app";

// Google Calendar auto-sync. Paste the OAuth Web Client ID here once it's created
// (Google Cloud → Credentials → OAuth client ID → Web application, with JS origin
// https://nzmohan.github.io). Until then the app falls back to a one-tap "Add to
// Calendar" link that needs no setup.
export const GOOGLE_CLIENT_ID = "1097457013952-jjl2he5a8v1ji1sp4m1ihu9adh69hhin.apps.googleusercontent.com";

// The four board columns. Labels are overridable in Settings (stored shared in Supabase).
export const DEFAULT_COLUMNS = [
  { key: "ideas", label: "Ideas" },
  { key: "todo",  label: "To Do" },
  { key: "doing", label: "Doing" },
  { key: "done",  label: "Done" },
];
