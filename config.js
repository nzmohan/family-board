// Family Board — connection config.
// The anon key is safe to expose in the browser; row access is gated by the app passcode.
export const SUPABASE_URL = "https://yrnlbmdkdtwccqneungl.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmxibWRrZHR3Y2NxbmV1bmdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NTk5NDcsImV4cCI6MjA5NjQzNTk0N30.Dbbnp2n-M_BHFU72gDQMF9TJ8boH1nG5ViLaagzh7DU";

// The four board columns. Labels are overridable in Settings (stored shared in Supabase).
export const DEFAULT_COLUMNS = [
  { key: "ideas", label: "Ideas" },
  { key: "todo",  label: "To Do" },
  { key: "doing", label: "Doing" },
  { key: "done",  label: "Done" },
];
