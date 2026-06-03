# Brand Positioning Wizard - Setup & Usage Guide

## Overview
The Brand Positioning Wizard is a comprehensive AI-powered tool that generates professional brand positioning strategies using DeepSeek API integration.

## Features Implemented

### 1. Frontend Components
- **positioning-wizard.html** - Complete UI with two views:
  - Wizard view: Create positioning reports with a comprehensive form
  - Dashboard view: Manage and view saved positioning reports
- **positioning-wizard.js** - Client-side logic with:
  - Form validation and submission
  - Dynamic report generation and display
  - Save/load/delete report management
  - Tab navigation between wizard and dashboard

### 2. Backend API Endpoints

#### POST /api/positioning/generate
Generates a new positioning report using DeepSeek AI.
- **Authentication**: Required (session cookie)
- **Body**: 
  ```json
  {
    "brandName": "string",
    "industry": "string",
    "usp": "string",
    "brandTone": "string",
    "brandValues": ["array", "of", "values"]
  }
  ```
- **Returns**: Complete positioning report with all sections

#### POST /api/positioning/save
Saves a generated positioning report to the database.
- **Authentication**: Required
- **Body**: Full report object
- **Returns**: `{ok: true, id: "report-id"}`

#### GET /api/positioning/reports
Retrieves all saved positioning reports for the current user.
- **Authentication**: Required
- **Returns**: `{reports: [array of reports]}`

#### DELETE /api/positioning/delete/:id
Deletes a specific positioning report.
- **Authentication**: Required
- **Returns**: `{ok: true}`

### 3. Data Storage
- **File**: `positioning-reports.json`
- **Structure**: 
  ```json
  {
    "reports": [
      {
        "id": "pos-timestamp-random",
        "brandName": "string",
        "industry": "string",
        "usp": "string",
        "brandTone": "string",
        "brandValues": ["array"],
        "positioningStatement": "string",
        "taglines": ["array"],
        "differentiators": ["array"],
        "elevatorPitch": "string",
        "messaging": {
          "coreMessage": "string",
          "targetAudiences": [{type, description}],
          "supportingMessages": ["array"],
          "callToActions": ["array"]
        },
        "conclusion": "string",
        "userEmail": "string",
        "createdAt": "ISO timestamp",
        "savedAt": "ISO timestamp"
      }
    ]
  }
  ```

## Report Sections Generated

1. **Positioning Statement** - Compelling brand positioning using proven structure
2. **Brand Tagline Options** - 3 unique tagline variations
3. **Key Differentiators** - 4-6 competitive advantages
4. **Elevator Pitch** - 80-150 word investor/client-ready pitch
5. **Messaging Framework**
   - Core Message
   - Target Audiences (3 groups)
   - Supporting Messages (3 pillars)
   - Call to Action Options (3 CTAs)
6. **Strategic Conclusion** - 2-4 sentence market assessment

## Usage Instructions

### For Users
1. **Access the Wizard**: Navigate to `/positioning-wizard.html` (requires login)
2. **Fill Form**:
   - Enter Brand Name, Industry, USP
   - Select Brand Tone from dropdown
   - Choose at least 2 Brand Values
3. **Generate**: Click "Generate Positioning" button
4. **View Report**: Complete positioning strategy displays instantly
5. **Save**: Click "Save Report" to store for later
6. **Dashboard**: Switch to "Saved Reports" tab to:
   - View all your positioning reports
   - Search by brand name (via card display)
   - View full reports
   - Delete reports

### For Developers

#### Environment Variables Needed
```
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com (optional, has default)
DEEPSEEK_MODEL=deepseek-chat (optional, has default)
```

#### Integration with Existing Auth
- Uses same authentication as rest of app (session cookies)
- User email automatically extracted from session
- Reports are filtered by user email for isolation

#### Customization Points
1. **Brand Tone Options** - Edit dropdown in HTML
2. **Brand Values** - Add/remove checkboxes in HTML
3. **Report Prompt** - Modify the positioning prompt in server.js (line ~2240)
4. **Styling** - All CSS variables in `positioning-wizard.html` `:root`
5. **Report Template** - Modify `displayReport()` function in JavaScript

## Integration with Main App

### Add Navigation Link
Add this to your main navigation (e.g., in featurehub.html or main menu):
```html
<a href="/positioning-wizard.html" class="nav-link">Brand Positioning</a>
```

### Add to Dashboard
Reference the positioning wizard as part of your brand management suite.

## Testing Checklist

- [ ] User can login successfully
- [ ] Positioning wizard page loads after login
- [ ] Form validation prevents incomplete submissions
- [ ] DeepSeek API key is configured
- [ ] Generation works and displays report
- [ ] Report can be saved
- [ ] Reports appear in dashboard
- [ ] Reports can be deleted
- [ ] Print functionality works
- [ ] Copy to clipboard works
- [ ] Regenerate button resets form

## Troubleshooting

### "Failed to generate positioning"
- Check DeepSeek API key is set in environment
- Verify API key has sufficient credits
- Check network connectivity

### "Unauthorized" error
- Ensure user is logged in
- Check session cookie is set
- Clear browser cache and login again

### Reports not saving
- Verify user email is in session
- Check positioning-reports.json exists
- Ensure file permissions allow writing

### No reports in dashboard
- Check if user email matches saved reports
- Verify positioning-reports.json is not corrupted
- Check browser console for API errors

## API Response Examples

### Successful Generation
```json
{
  "report": {
    "id": "pos-1234567890-abc123",
    "brandName": "Tesla",
    "positioningStatement": "For environmentally conscious tech enthusiasts...",
    "taglines": ["Drive Tomorrow", "Electric Dreams", "Zero Emissions, Pure Innovation"],
    "differentiators": ["..."],
    "elevatorPitch": "...",
    "messaging": {...},
    "conclusion": "..."
  }
}
```

### Error Response
```json
{
  "message": "Failed to generate positioning"
}
```

## Performance Notes
- Report generation typically takes 2-5 seconds depending on DeepSeek API
- Loading reports is instant (stored locally)
- Deletion is immediate
- No pagination needed (suitable for users with <1000 reports)

## Future Enhancements
- Export reports to PDF
- Share reports with team members
- Brand guideline templates
- Competitive analysis integration
- Multi-language support
