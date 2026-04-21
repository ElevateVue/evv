# GA4 & Google Search Console Integration

This guide will help you connect GA4 (Google Analytics 4) and Google Search Console to your application.

## Setup Steps

### 1. Service Account Configuration (Already Done ✓)

The service account credentials have been stored in `backend/ga4-config.json`:
- **Project ID**: ev-tool-492111
- **Service Account Email**: elavate-vue@ev-tool-492111.iam.gserviceaccount.com
- **Features**: Read-only access to GA4 and Google Search Console

⚠️ **Security**: Keep `ga4-config.json` in `.gitignore` and never commit to version control.

### 2. Update .env Configuration

Edit `.env` in your project root and add:

```env
# GA4 Configuration
GA4_PROPERTY_ID=your_ga4_property_id_here
GA4_MEASUREMENT_ID=your_ga4_measurement_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=elavate-vue@ev-tool-492111.iam.gserviceaccount.com

# Google Search Console
GSC_PROPERTY_URL=https://your-website.com
```

### 3. Find Your GA4 Property ID

1. Go to [Google Analytics](https://analytics.google.com)
2. Select your property
3. Click **Admin** (gear icon)
4. Under "PROPERTY", click **Property settings**
5. Copy the **Property ID** (e.g., `123456789`)
6. Paste into `.env` as `GA4_PROPERTY_ID`

### 4. Grant Service Account Access

#### For GA4:
1. Go to your GA4 Property
2. Click **Admin** → **Property Access Management**
3. Click **+ Grant Access**
4. Paste: `elavate-vue@ev-tool-492111.iam.gserviceaccount.com`
5. Choose **Viewer** role
6. Save

#### For Google Search Console:
1. Go to [Google Search Console](https://search.google.com/search-console)
2. Select your property
3. Click **Settings** → **Users and permissions**
4. Click **Add user**
5. Paste: `elavate-vue@ev-tool-492111.iam.gserviceaccount.com`
6. Choose **Restricted access** (Viewer only)
7. Save

## Available API Endpoints

### GA4 Endpoints

#### Get GA4 Properties
```http
GET /api/ga4/properties
```

**Response**:
```json
{
  "properties": [
    {
      "name": "properties/123456789",
      "displayName": "My Website",
      "propertyType": "PROPERTY_TYPE_ORDINARY",
      "serviceLevel": "ANALYTICS_SERVICE_LEVEL_STANDARD"
    }
  ]
}
```

#### Fetch GA4 Report
```http
POST /api/ga4/report
Content-Type: application/json

{
  "propertyId": "123456789",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "dimensions": ["date", "country"],
  "metrics": ["activeUsers", "newUsers", "sessions"]
}
```

**Available Metrics**:
- `activeUsers` - Users with any activity
- `newUsers` - New users
- `sessions` - Website sessions
- `screenPageViews` - Page views
- `eventCount` - Total events
- `engagementRate` - Engagement rate
- `bounceRate` - Bounce rate
- `sessionDuration` - Average session duration

#### Real-time GA4 Data
```http
GET /api/ga4/realtime?propertyId=123456789
```

**Response**:
```json
{
  "dimensionHeaders": [],
  "metricHeaders": [
    {"name": "activeUsers"},
    {"name": "newUsers"}
  ],
  "rows": [
    {
      "metricValues": [
        {"value": "235"},
        {"value": "42"}
      ]
    }
  ]
}
```

### Google Search Console Endpoints

#### Get GSC Sites
```http
GET /api/gsc/sites
```

**Response**:
```json
{
  "sites": [
    {
      "siteUrl": "https://example.com/",
      "permissionLevel": "siteOwner"
    }
  ]
}
```

#### Fetch GSC Report
```http
POST /api/gsc/report
Content-Type: application/json

{
  "siteUrl": "https://example.com/",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "dimensions": ["date", "query", "page", "country"],
  "metrics": ["impressions", "clicks", "ctr", "position"]
}
```

**Available Metrics**:
- `impressions` - Search impressions
- `clicks` - Search clicks
- `ctr` - Click-through rate
- `position` - Average position

## Frontend Integration Example

### Using Fetch API

```javascript
// Get GA4 Properties
async function fetchGA4Properties() {
  const response = await fetch('/api/ga4/properties');
  const data = await response.json();
  return data.properties;
}

// Fetch GA4 Report
async function fetchGA4Data(propertyId, startDate, endDate) {
  const response = await fetch('/api/ga4/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      propertyId,
      startDate,
      endDate,
      metrics: ['activeUsers', 'sessions', 'engagementRate']
    })
  });
  return response.json();
}

// Get Real-time Data
async function fetchRealtime(propertyId) {
  const response = await fetch(`/api/ga4/realtime?propertyId=${propertyId}`);
  return response.json();
}

// Fetch GSC Report
async function fetchGSCData(siteUrl, startDate, endDate) {
  const response = await fetch('/api/gsc/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteUrl,
      startDate,
      endDate,
      metrics: ['impressions', 'clicks', 'ctr']
    })
  });
  return response.json();
}
```

## Common Issues & Solutions

### Issue: "Service Account not configured"
**Solution**: Ensure `backend/ga4-config.json` exists with valid credentials.

### Issue: "Permission denied" errors
**Solution**: 
1. Verify the service account has been added to both GA4 and GSC
2. Wait 5-10 minutes for permissions to propagate
3. Use the Viewer role (read-only access)

### Issue: "Property not found"
**Solution**: 
1. Double-check the Property ID in `.env`
2. Ensure the property exists in your GA4 account
3. The service account must have access to the property

### Issue: GA4 returns empty results
**Solution**: 
1. Ensure the date range has valid data
2. Use format: `YYYY-MM-DD`
3. GA4 has a 24-48 hour data latency

## Next Steps

1. ✓ Configure `.env` with your Property IDs
2. ✓ Grant service account access to GA4 and GSC
3. ✓ Test endpoints using the Frontend
4. ✓ Build dashboards to display the data

## Support Resources

- [GA4 Dimension & Metrics Reference](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [GSC API Documentation](https://developers.google.com/webmaster-tools/Search-Console-API)
- [Analytics Admin API](https://developers.google.com/analytics/devguides/config/admin/v1/quickstart)

---

**Last Updated**: April 13, 2026
**Status**: ✓ Service Account Ready | ⏳ Configuration Pending
