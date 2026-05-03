# Client Share Deployment

This app can now be shared with a client as a real hosted link, but it should be deployed on a host that supports a persistent Node server and local file writes.

## Recommended host

Use `Render` or `Railway`.

Do not use Vercel for the full app in its current form because this project stores shared app state in local JSON files:

- uploaded analytics
- generated reports
- client sessions

That pattern is fine on a small persistent Node host, but unreliable on serverless functions.

## What the client can do after deploy

- open the login page
- sign in with any email/password
- reach the dashboard
- view their own seeded demo analytics immediately
- upload their own CSV files into their own workspace
- see their own dashboard graphs, reports, and saved feedback
- open the reports page
- generate new reports without overwriting other clients

## Workspace behavior

Each logged-in email now gets its own isolated workspace.

- analytics uploads are per client
- dashboard metrics and graphs are per client
- reports are per client
- browser-saved items like feedback, queue items, connections, and hashtag sets are scoped per client in the browser

The admin can still open the admin hub and see client activity, sign-ins, recent usage, and workspace summaries without mixing client data together.

## Required environment variables

Minimum:

- `PORT`

Optional but recommended for AI/integrations:

- `ADMIN_EMAILS`
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `AI_UPLOAD_PROVIDER`
- `AI_SUGGESTIONS_PROVIDER`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_NEWSLETTER_REPLY_TO`

Notes:

- `ADMIN_EMAILS` should be a comma-separated list such as `you@example.com,ops@example.com`. Any email in that list is redirected into the admin hub and can access `/clienthub.html`.
- If no AI provider keys are set, the app now falls back to built-in local report suggestions instead of failing.
- If no analytics CSV has been uploaded yet, the app now shows shared seeded demo data so the client link is not blank.

## Render quick start

1. Push this repo to GitHub.
2. In Render, create a new `Web Service`.
3. Connect the repo.
4. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add any environment variables you want.
6. Deploy and send the generated URL to the client.

## Recommended client handoff flow

1. Deploy the app.
2. Open the live URL yourself.
3. Sign in once and confirm:
   - `/signin.html`
   - `/dashboard-overview.html`
   - `/report.html`
4. If you have real analytics CSVs, upload them before sending the link so the dashboard reflects the client account data rather than the seeded demo set.
