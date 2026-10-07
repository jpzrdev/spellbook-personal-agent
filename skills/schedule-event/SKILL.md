---
name: schedule-event
description: Creates ONE Google Calendar event with the exact parameters Gandalf sent, after the user confirmed it in the HUD. Never edits or deletes events.
# The only skill that writes to a connector, and it only creates. Editing/deleting are blocked by --allowedTools.
allowed-tools: mcp__claude_ai_Google_Calendar__create_event, mcp__claude_ai_Google_Calendar__search_events, mcp__claude_ai_Google_Calendar__list_events
---

# Create a Google Calendar event

The request carries a JSON block with the parameters for the `create_event` tool. The user has already checked and confirmed this data in the HUD.

## Rules

- Create **exactly one** event, with **exactly** the JSON parameters. Don't invent, translate or "improve" the title, date, time, recurrence or reminders.
- Never edit, move or delete existing events. Don't invite anyone.
- Don't create or edit files in the memory.
- If the Google Calendar tools are not available, reply "Google Calendar connector not configured." and stop.

## Steps

1. Look for a duplicate: `search_events` (or `list_events`) on the event's day for the same title. If an event with the same title already exists on the same day/time, **don't create it**: reply "Already on the calendar: <title> on <date>."
2. Call `create_event` with the JSON parameters.
3. If it fails, try once more; if it fails again, reply with the error in one sentence.

## Final answer

One line, in the user's language: "Created: <title>, <long date> (<time or all day><, repeats …>)." No link and no IDs.
