---
name: sync-calendar
description: Uses the Google Calendar connector to write life/agenda/YYYY-MM-DD.md for the next 7 days. Use in the periodic routine or when asked to "update my agenda".
# Read-only on Google Calendar (claude.ai account connector). Creating/editing/deleting events is blocked.
allowed-tools: mcp__claude_ai_Google_Calendar__list_calendars, mcp__claude_ai_Google_Calendar__list_events, mcp__claude_ai_Google_Calendar__search_events, mcp__claude_ai_Google_Calendar__get_event
---

# Sync calendar

Uses the claude.ai account's Google Calendar connector. If the Google Calendar tools are not available, reply "Google Calendar connector not configured." and stop, without changing files.

## Steps

1. Fetch the events from today to 7 days from now (the user's time zone), from every calendar marked as visible.
2. For each day, write `life/agenda/YYYY-MM-DD.md` **replacing** the previous content:

```markdown
---
type: agenda
date: YYYY-MM-DD
source: google-calendar
synced: YYYY-MM-DDTHH:MM:SS-03:00
---
- 09:00–10:30 Event title (Location)
- 14:00 Event without a set end
- All-day event
```

   - One line per event, sorted by time; all-day events without a time.
   - Location in parentheses only if there is one. Don't copy long descriptions or video call links.
   - Days without events: write the file with just the frontmatter.
3. Don't touch agenda files of past days.

## Final answer

"Calendar synced: N events in 7 days."
