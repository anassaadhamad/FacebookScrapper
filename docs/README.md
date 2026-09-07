# 📊 Giveaway Analyzer — Live Dashboard

A premium web dashboard for visualizing Facebook Giveaway Scraper results.
**Live demo**: _[your-github-username.github.io/FacebookScrapper](https://your-username.github.io/FacebookScrapper)_

---

## 🚀 Deploy to GitHub Pages (5 minutes)

### Step 1 — Push your repo to GitHub
```bash
git init
git add .
git commit -m "feat: add web dashboard"
git remote add origin https://github.com/YOUR_USERNAME/FacebookScrapper.git
git push -u origin main
```

### Step 2 — Enable GitHub Pages
1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Set branch to `main` and folder to `/dashboard`
4. Click **Save**

✅ Your dashboard will be live at:  
`https://YOUR_USERNAME.github.io/FacebookScrapper`

---

## 🔧 Update Demo Data

To refresh the demo data with new scraping results:

```bash
node -e "
const fs=require('fs');
const d=JSON.parse(fs.readFileSync('./results/YOUR_LATEST_SUMMARY.json'));
const out={
  totalCommentsScraped: d.totalCommentsScraped,
  totalUniqueCommenters: d.totalUniqueCommenters,
  topCommenter: {authorId: d.topCommenter.authorId, authorName: d.topCommenter.authorName, commentCount: d.topCommenter.commentCount},
  leaderboard: d.leaderboard.slice(0,30),
  allComments: d.allComments.slice(0,200)
};
fs.writeFileSync('./dashboard/demo-data.json', JSON.stringify(out, null, 2));
console.log('Done!');
"
```

---

## 🛠 Run Locally

```bash
npx serve dashboard --listen 4200
# Open http://localhost:4200
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🏆 Leaderboard | Ranked table with progress bars and rank badges |
| 📊 Bar Chart | Top 10 commenters visualization |
| 🍩 Doughnut Chart | Comment distribution breakdown |
| 💬 Comment Feed | Paginated feed with author filter |
| 🔍 Live Search | Filter leaderboard by name or user ID |
| 📥 Export CSV | Download leaderboard as CSV |
| 🌑 Dark Mode | Premium dark theme by default |
| 📱 Responsive | Works on mobile and desktop |
