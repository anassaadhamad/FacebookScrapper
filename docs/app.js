/* ══════════════════════════════════════════════════════════════
   FACEBOOK GIVEAWAY ANALYZER — DASHBOARD APP LOGIC
══════════════════════════════════════════════════════════════ */

const GITHUB_URL = 'https://github.com/anassaadhamad/FacebookScrapper'; // ← رابط الـ repo

// ─── State ───────────────────────────────────────────────────
let allData = null;
let displayedComments = 0;
const COMMENTS_PER_PAGE = 12;
let filteredComments = [];
let barChart = null;
let doughnutChart = null;

// ─── Boot ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set GitHub links
  document.querySelectorAll('#github-link, #footer-github').forEach(el => el.href = GITHUB_URL);

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 40);
  });

  // Intersection observer for stat cards
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.15 });
  document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));

  // Load demo data automatically
  loadDemoData();

  // Event listeners
  document.getElementById('leaderboard-search').addEventListener('input', renderLeaderboard);
  document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
  document.getElementById('comment-filter').addEventListener('change', resetAndRenderComments);
  document.getElementById('load-more-btn').addEventListener('click', loadMoreComments);
});

// ─── Data Loading ─────────────────────────────────────────────
async function loadDemoData() {
  try {
    const res = await fetch('./demo-data.json');
    if (!res.ok) throw new Error('Could not load demo-data.json');
    allData = await res.json();
    processData(allData);
  } catch (err) {
    console.error('Failed to load demo data:', err);
    showError();
  }
}

function processData(data) {
  const { leaderboard, allComments, totalCommentsScraped, totalUniqueCommenters, topCommenter } = data;

  // Compute total from leaderboard for accurate percentage
  const totalEntries = leaderboard.reduce((s, u) => s + u.commentCount, 0);

  // Enrich leaderboard with percentage
  const enriched = leaderboard.map(row => ({
    rank:         row.rank,
    authorId:     row.authorId || 'N/A',
    authorName:   row.authorName || 'Anonymous',
    commentCount: row.commentCount,
    profileUrl:   row.profileUrl || '',
    pct:          totalEntries > 0 ? ((row.commentCount / totalEntries) * 100).toFixed(1) : '0.0'
  }));

  allData._enriched  = enriched;
  allData._totalEntries = totalEntries;

  animateStats(totalCommentsScraped, totalUniqueCommenters, topCommenter?.commentCount || 0,
    totalUniqueCommenters > 0 ? Math.round(totalEntries / totalUniqueCommenters) : 0);

  renderLeaderboard();
  renderCharts(enriched);

  // Populate comment filter
  const filterEl = document.getElementById('comment-filter');
  enriched.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.authorId;
    opt.textContent = `${u.authorName} (${u.commentCount})`;
    filterEl.appendChild(opt);
  });

  filteredComments = allComments;
  displayedComments = 0;
  renderComments();
}

// ─── Animated Counters ────────────────────────────────────────
function animateStats(total, unique, topCount, avg) {
  animateNumber('stat-total-comments', total);
  animateNumber('stat-unique',         unique);
  animateNumber('stat-top-count',      topCount);
  animateNumber('stat-avg',            avg);
}

function animateNumber(id, target, duration = 1500) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(easeOut(progress) * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Leaderboard ──────────────────────────────────────────────
function renderLeaderboard() {
  if (!allData?._enriched) return;
  const query = document.getElementById('leaderboard-search').value.toLowerCase().trim();
  const rows  = allData._enriched.filter(u =>
    !query ||
    u.authorName.toLowerCase().includes(query) ||
    u.authorId.toLowerCase().includes(query)
  );

  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = rows.map(u => `
    <tr>
      <td>${rankBadge(u.rank)}</td>
      <td>
        <div class="commenter-name">${escapeHtml(u.authorName)}</div>
        ${u.profileUrl ? `<a href="${u.profileUrl}" target="_blank" rel="noopener" class="commenter-profile">View Profile ↗</a>` : ''}
      </td>
      <td><span class="user-id">${escapeHtml(u.authorId)}</span></td>
      <td>
        <div class="entries-cell">
          <span class="entries-num">${u.commentCount.toLocaleString()}</span>
        </div>
      </td>
      <td>
        <div class="share-bar-wrapper">
          <div class="share-bar-track">
            <div class="share-bar-fill" style="width:${u.pct}%"></div>
          </div>
          <span class="share-pct">${u.pct}%</span>
        </div>
      </td>
    </tr>
  `).join('');
}

function rankBadge(rank) {
  if (rank === 1) return `<span class="rank-badge rank-badge--gold">🥇</span>`;
  if (rank === 2) return `<span class="rank-badge rank-badge--silver">🥈</span>`;
  if (rank === 3) return `<span class="rank-badge rank-badge--bronze">🥉</span>`;
  return `<span class="rank-badge rank-badge--default">${rank}</span>`;
}

// ─── Charts ───────────────────────────────────────────────────
function renderCharts(leaderboard) {
  const top10  = leaderboard.slice(0, 10);
  const labels = top10.map(u => truncate(u.authorName, 14));
  const values = top10.map(u => u.commentCount);

  const PALETTE = [
    '#6C63FF','#00D4AA','#FFB800','#FF5E6C','#38BDF8',
    '#A78BFA','#34D399','#FBBF24','#F87171','#60A5FA'
  ];

  // Bar chart
  if (barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Comments',
        data: values,
        backgroundColor: PALETTE,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0D1120',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#F1F5FF',
          bodyColor: '#A3ADBF',
          padding: 12,
          callbacks: {
            label: ctx => ` ${ctx.raw.toLocaleString()} comments`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#58647A', font: { size: 12 } },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { color: '#58647A', font: { size: 12 } },
          grid: { color: 'rgba(255,255,255,0.04)' },
          beginAtZero: true
        }
      }
    }
  });

  // Doughnut chart
  const others = leaderboard.slice(10).reduce((s, u) => s + u.commentCount, 0);
  const dLabels = [...top10.map(u => truncate(u.authorName, 12)), ...(others > 0 ? ['Others'] : [])];
  const dValues = [...values, ...(others > 0 ? [others] : [])];
  const dColors = [...PALETTE, '#374151'];

  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart(document.getElementById('doughnutChart'), {
    type: 'doughnut',
    data: {
      labels: dLabels,
      datasets: [{
        data: dValues,
        backgroundColor: dColors,
        borderColor: '#0D1120',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#A3ADBF', font: { size: 11 },
            padding: 12, boxWidth: 12, boxHeight: 12
          }
        },
        tooltip: {
          backgroundColor: '#0D1120',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#F1F5FF',
          bodyColor: '#A3ADBF',
          padding: 12
        }
      }
    }
  });
}

// ─── Comments Feed ────────────────────────────────────────────
function resetAndRenderComments() {
  const filterVal = document.getElementById('comment-filter').value;
  filteredComments = filterVal
    ? (allData.allComments || []).filter(c => c.authorId === filterVal)
    : (allData.allComments || []);
  displayedComments = 0;
  document.getElementById('comments-grid').innerHTML = '';
  renderComments();
}

function renderComments() {
  const grid  = document.getElementById('comments-grid');
  const slice = filteredComments.slice(displayedComments, displayedComments + COMMENTS_PER_PAGE);

  slice.forEach((c, i) => {
    const name   = c.authorName || 'Anonymous';
    const text   = c.text || '';
    const url    = c.commentUrl || '';
    const date   = c.date ? new Date(c.date).toLocaleString() : '';
    const initials = name.slice(0, 2).toUpperCase();
    const colorClass = `avatar-${(displayedComments + i) % 5}`;

    const card = document.createElement('div');
    card.className = 'comment-card';
    card.innerHTML = `
      <div class="comment-header">
        <div class="comment-avatar ${colorClass}">${initials}</div>
        <div>
          <div class="comment-author">${escapeHtml(name)}</div>
          ${date ? `<div class="comment-date">${date}</div>` : ''}
        </div>
      </div>
      <div class="comment-text" dir="auto">${escapeHtml(text)}</div>
      ${url ? `<a href="${url}" target="_blank" rel="noopener" class="comment-link">View on Facebook ↗</a>` : ''}
    `;
    grid.appendChild(card);
  });

  displayedComments += slice.length;

  const btn = document.getElementById('load-more-btn');
  btn.style.display = displayedComments >= filteredComments.length ? 'none' : 'inline-flex';
}

function loadMoreComments() { renderComments(); }

// ─── Export CSV ───────────────────────────────────────────────
function exportCSV() {
  if (!allData?._enriched) return;
  const header = ['Rank','Author Name','Author ID','Comments','% Share','Profile URL'];
  const rows   = allData._enriched.map(u => [
    u.rank, `"${u.authorName}"`, u.authorId, u.commentCount, u.pct + '%', u.profileUrl
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'giveaway_leaderboard.csv';
  a.click();
}

// ─── Helpers ──────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function truncate(str, n) { return str.length > n ? str.slice(0, n) + '…' : str; }

function showError() {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;
      font-family:Inter,sans-serif;background:#080B14;color:#F1F5FF;text-align:center;padding:40px;">
      <div>
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <h2 style="font-size:24px;margin-bottom:8px">Could not load demo data</h2>
        <p style="color:#A3ADBF">Make sure <code>demo-data.json</code> is in the same folder as <code>index.html</code></p>
      </div>
    </div>`;
}
