# ADR 004: NM Host Manifest Location for Custom Chrome Profiles

## Status
Accepted

## Context
Chrome launched with `--user-data-dir` pointing to a custom profile directory (e.g., `~/.phantom-chrome-profile`) does NOT look for Native Messaging host manifests in the standard `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` directory. The extension logs "Specified native messaging host not found."

## Decision
Install the NM host manifest to BOTH locations:
- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` (default Chrome)
- `~/.phantom-chrome-profile/NativeMessagingHosts/` (Phantom profile)

The setup script handles this automatically.

## Consequences
- Extension works in the Phantom custom profile
- If the profile path changes, setup script must be re-run
