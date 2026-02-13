# FamilyPulse — Family Task Tracker

```text
███████╗ █████╗ ███╗   ███╗██╗██╗  ██╗   ██╗██████╗ ██╗   ██╗██╗     ███████╗███████╗
██╔════╝██╔══██╗████╗ ████║██║██║  ╚██╗ ██╔╝██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
█████╗  ███████║██╔████╔██║██║██║   ╚████╔╝ ██████╔╝██║   ██║██║     ███████╗█████╗  
██╔══╝  ██╔══██║██║╚██╔╝██║██║██║    ╚██╔╝  ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝  
██║     ██║  ██║██║ ╚═╝ ██║██║███████╗██║   ██║     ╚██████╔╝███████╗███████║███████╗
╚═╝     ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚══════╝╚═╝   ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝
```

🌐 **Live Website:** https://grizzly27.github.io/FP/

A modern, mobile-first web app for tracking daily household tasks by family member with beautiful line chart visualizations.

## Features

✨ **Smooth Line Chart** — Track task completion over time with smoothed lines, data labels, and family member avatars  
📱 **Mobile-First Design** — Optimized for iPhone with PWA support (Add to Home Screen)  
👨‍👩‍👧‍👦 **Family Members** — Add unlimited family members with photos  
📊 **Statistics** — View daily counts, 7-day averages, streaks, and breakdowns by person  
🔄 **Recurring Tasks** — Set tasks to repeat daily, weekly, or monthly  
💾 **Local Storage** — All data stays on your device, no server required  
🎨 **Modern UI** — Clean enterprise feel with blue/white/grey palette and smooth animations

## Getting Started

### On Desktop/Laptop

1. **Open the app**: Double-click `index.html` or right-click → "Open with" → your browser
2. **Add family members**: On first launch, add at least one family member with a name and photo
3. **Start tracking**: Tap the `+` button to add tasks

### On iPhone

1. **Transfer files**: Upload the entire folder to a web server, or use a service like GitHub Pages
2. **Open in Safari**: Navigate to the URL
3. **Add to Home Screen**: Tap the Share button → "Add to Home Screen"
4. **Launch**: Open FamilyPulse from your home screen like a native app

### Quick Local Server (Optional)

If you want to test on your iPhone without deploying:

```bash
# Navigate to this folder in terminal
cd "c:\Users\dwhit\OneDrive\_1Web\personal_tracker"

# Start a simple HTTP server (Python 3)
python -m http.server 8000

# Or with Node.js (if you have npx)
npx -y http-server -p 8000
```

Then open `http://YOUR-COMPUTER-IP:8000` on your iPhone.

## Usage

### Chart View
- Toggle between **Daily** and **Cumulative** counts
- View task trends from first entry to 7 days in the future
- Each family member has their own colored line with avatar

### Tasks View
- Add new tasks with the `+` button
- Edit or delete historical tasks
- Set recurring tasks (daily/weekly/monthly)

### Stats View
- See total tasks, 7-day average, and longest streak
- View breakdown by family member

### Settings
- Manage family members
- Export/import data as JSON backup

## Technical Details

- **Framework**: Vanilla HTML/CSS/JavaScript (no build tools)
- **Charting**: Chart.js 4 with data labels plugin
- **Storage**: localStorage (client-side only)
- **PWA**: Includes manifest.json for installable web app
- **Design**: Inter font, blue (#2563EB) primary color, smooth animations

## Browser Compatibility

- ✅ Chrome/Edge (recommended)
- ✅ Safari (iOS/macOS)
- ✅ Firefox
- ⚠️ Requires modern browser with ES6+ support

## Data Management

All data is stored locally in your browser's localStorage. To backup:

1. Go to **Settings** tab
2. Tap **Export Data**
3. Save the JSON file

To restore or transfer to another device:

1. Go to **Settings** tab
2. Tap **Import Data**
3. Select your backup JSON file

---

**Enjoy tracking your family's tasks!** 🎉
