# Obscribe Beta Tester Checklist

Use this checklist for each early tester. The goal is to validate the core notebook loop, not add feature requests yet.

## Before Inviting

- Confirm latest Vercel deploy is green.
- Confirm Supabase auth works on `obscribe.com` and `www.obscribe.com`.
- Confirm optional trash lookup indexes have been run.
- Keep a known-issues note ready so repeated feedback can be grouped.

## Tester Script

Ask testers to spend 15–20 minutes doing this:

1. Create an account.
2. Create a new notebook.
3. Add or rename a tab/section.
4. Create three pages:
   - one blank note
   - one checklist
   - one project/study-style page
5. Write enough text to test autosave.
6. Refresh the browser and confirm the pages remain.
7. Search for text from one page.
8. Use Quick Capture and confirm it lands in Inbox.
9. Move one page to Trash, restore it, then delete a test page forever.
10. Sign out and sign back in.
11. Optional: add an AI provider key and summarize a short page.

## Feedback Questions

Ask testers:

- Where did you hesitate or feel unsure?
- Did anything fail to save or feel risky?
- Was notebook → tab → page organization clear?
- Did Quick Capture behave how you expected?
- What felt calmer or better than Notion?
- What felt missing only because the core loop was incomplete?

## Known Beta Boundaries

- No team collaboration.
- No public sharing.
- No local-to-cloud migration yet.
- No mobile-native app yet.
- AI is explicit and provider-key based only.
- Export is currently basic page/notebook export, not a full backup system.

## Pass Criteria

A tester is considered successful if they can:

- register/sign in
- create and organize notes
- reload without losing work
- find notes via search
- recover from Trash
- understand what is local/cloud/AI without handholding
