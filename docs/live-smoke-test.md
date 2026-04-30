# Obscribe Live Smoke Test

Run after each beta-facing deploy.

## Account A

1. Open https://obscribe.com.
2. Register or sign in as tester A.
3. Create a notebook named `Beta Smoke A`.
4. Add a tab named `Smoke Tab`.
5. Create a page named `Smoke Page`.
6. Add text containing `smoke-search-token`.
7. Wait for `Saved`.
8. Refresh the browser.
9. Confirm the notebook, tab, page, and text remain.
10. Search for `smoke-search-token` and open the result.
11. Quick Capture `captured smoke note` and confirm it appears in Inbox.
12. Move the page to Trash, restore it, then permanently delete a disposable test page.

## Account B / RLS Check

1. Sign out.
2. Register or sign in as tester B.
3. Confirm Account B cannot see `Beta Smoke A` or Account A pages.
4. Create a new notebook and confirm it saves independently.

## Auth / AI Check

1. Test password reset link if auth settings were changed.
2. If AI is enabled for the tester, summarize a short page and confirm the output appears.

## Pass Criteria

- No lost edits after refresh.
- Account B cannot see Account A data.
- Trash restore/delete works without orphaned tabs/pages.
- No visible production errors.
