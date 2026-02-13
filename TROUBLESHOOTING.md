# FamilyPulse Troubleshooting Guide

## Fixed Issues (v1.1)

✅ **Chart not displaying** - Fixed Chart.js datalabels plugin registration  
✅ **Cannot save members/tasks** - Fixed initialization flow when setup is complete  
✅ **Modals not working** - Fixed event listener initialization order  

## How to Use

### First Time Setup

1. **Open the app** at `http://localhost:8000` (server is running)
2. You'll see "Welcome to FamilyPulse"
3. Click **"Add Family Member"**
4. Enter a name and upload a photo
5. Click **Save**
6. Repeat for all family members
7. Click **"Get Started"**

### Adding Tasks

1. Tap the **blue + button** (bottom right) or the + in the header
2. Select a family member from the dropdown
3. Enter the task name (e.g., "Dishes", "Laundry")
4. Choose the date (defaults to today)
5. Optionally set a time
6. Choose if it's recurring (one-time, daily, weekly, monthly)
7. Click **Save**

### Viewing the Chart

1. The chart appears on the **Chart tab** (first tab)
2. Toggle between **Daily** and **Cumulative** counts
3. Each family member has their own colored line
4. Data labels show the count at each point
5. Family member photos appear at the end of each line

## Common Issues

### "I don't see the chart"
- **Check**: Did you add at least one family member?
- **Check**: Did you add at least one task?
- **Fix**: The chart needs data to display. Add a task first.

### "The save button doesn't work"
- **Check**: Did you enter a task name?
- **Check**: Did you select a family member?
- **Fix**: Both fields are required.

### "I can't add family members after setup"
- **Go to**: Settings tab (gear icon)
- **Click**: "Add Family Member" button
- **Or**: Click the member's name to edit

### "The chart looks empty"
- **Reason**: You may only have tasks on one date
- **Fix**: Add tasks across multiple dates to see the line trend
- **Note**: X-axis shows from first task date to today + 7 days

### "Data labels are missing"
- **Fixed in v1.1**: Chart.js datalabels plugin is now properly registered
- **If still missing**: Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)

### "Photos don't appear"
- **Check**: File size - very large images may cause issues
- **Tip**: Use photos under 1MB for best performance
- **Format**: JPG, PNG, GIF are all supported

## Browser Console Errors

If something isn't working, open the browser console:
- **Windows/Linux**: Press `F12` or `Ctrl+Shift+I`
- **Mac**: Press `Cmd+Option+I`

Look for red error messages and check:
1. Are Chart.js and ChartDataLabels loaded? (Check Network tab)
2. Are there any JavaScript errors? (Check Console tab)
3. Is localStorage enabled? (Check Application tab → Local Storage)

## Data Management

### Backup Your Data
1. Go to **Settings** tab
2. Click **Export Data**
3. Save the JSON file somewhere safe

### Restore Data
1. Go to **Settings** tab
2. Click **Import Data**
3. Select your backup JSON file

### Clear All Data
Open browser console and run:
```javascript
localStorage.clear();
location.reload();
```

## Performance Tips

1. **Keep photos reasonable size** (< 500KB each)
2. **Archive old tasks** periodically by exporting and clearing
3. **Use Chrome or Edge** for best performance
4. **Clear browser cache** if the app feels slow

## Mobile (iPhone) Setup

1. **Start the server** on your computer:
   ```
   python -m http.server 8000
   ```

2. **Find your computer's IP address**:
   - Windows: Run `ipconfig` and look for IPv4 Address
   - Mac: Run `ifconfig` and look for inet address

3. **On your iPhone**:
   - Open Safari
   - Go to `http://YOUR-IP:8000` (e.g., `http://192.168.1.100:8000`)
   - Tap the Share button (square with arrow)
   - Tap "Add to Home Screen"
   - Name it "FamilyPulse"
   - Tap "Add"

4. **Launch from home screen** like a native app!

## Still Having Issues?

1. **Hard refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear localStorage**: See "Clear All Data" above
3. **Check server is running**: You should see "Serving HTTP on :: port 8000..."
4. **Try a different browser**: Chrome, Edge, or Firefox recommended
5. **Check the README.md** for additional setup instructions

---

**Version**: 1.1  
**Last Updated**: 2026-02-12
