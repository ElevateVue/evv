# Google Integration Setup

## Prerequisites
1. **Google Cloud Console Account**: Visit https://console.cloud.google.com/ and create a project if you don't have one.

## Step 1: Enable APIs
In Google Cloud Console:
- Go to "APIs & Services" > "Library"
- Enable:
  - Google Search Console API (for GSC)
  - Google Analytics Data API (for GA4)

## Step 2: Create OAuth 2.0 Credentials
- Go to "APIs & Services" > "Credentials"
- Click "Create Credentials" > "OAuth 2.0 Client IDs"
- Application type: Web application
- Authorized redirect URIs: Add `http://localhost:3000/api/google/oauth-callback`
- Copy the Client ID and Client Secret

## Step 3: Environment Variables
Create a `.env` file in your project root with:
```
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

## Step 4: Google Account Setup
- **For Google Search Console**: Add your website to GSC at https://search.google.com/search-console
- **For GA4**: Set up a GA4 property at https://analytics.google.com/ and note the Property ID (e.g., 123456789)

## Step 5: Run the App
- Start the server: `npm start`
- Go to Connect page and click "Connect" for GSC or GA4
- Authorize the app in your browser

The integration code is already implemented in the app. Once credentials are set, you'll be able to fetch data from GSC and GA4.