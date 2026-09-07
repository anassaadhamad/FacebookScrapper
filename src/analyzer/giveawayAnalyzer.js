import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import { logInfo, logSuccess, renderLeaderboard } from '../cli/ui.js';

export function analyzeComments(comments) {
  const userMap = new Map();

  for (const comment of comments) {
    // Unique author ID determination
    let authorId = comment['author/id'] || comment.authorId;
    const authorName = comment['author/name'] || comment.authorName || 'Unknown User';

    // Normalize authorId from profile URL if missing
    if (!authorId && comment.profileUrl) {
      authorId = extractIdFromUrl(comment.profileUrl);
    }

    // Fallback key if no authorId could be resolved
    const key = authorId || `name:${authorName.trim().toLowerCase()}`;

    if (!userMap.has(key)) {
      userMap.set(key, {
        authorId: authorId || 'N/A',
        authorName: authorName,
        commentCount: 0,
        comments: [],
        profileUrl: comment.profileUrl || ''
      });
    }

    const userData = userMap.get(key);
    userData.commentCount += 1;
    userData.comments.push({
      text: comment.text || '',
      commentUrl: comment.commentUrl || '',
      date: comment.date || comment.timestamp || ''
    });
  }

  // Convert to sorted leaderboard array
  const leaderboard = Array.from(userMap.values()).sort(
    (a, b) => b.commentCount - a.commentCount
  );

  return leaderboard;
}

function extractIdFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const idParam = parsed.searchParams.get('id');
    if (idParam) return idParam;
    
    // e.g. /profile.php?id=1000123456
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return pathParts[pathParts.length - 1];
    }
  } catch (e) {
    // Ignore invalid URL parsing
  }
  return url;
}

export async function exportResults(comments, leaderboard, outputDir = './results', prefix = 'facebook_giveaway') {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // 1. Export Leaderboard CSV
  const leaderboardCsvPath = path.join(outputDir, `${prefix}_leaderboard_${timestamp}.csv`);
  const leaderboardWriter = createObjectCsvWriter({
    path: leaderboardCsvPath,
    header: [
      { id: 'rank', title: 'Rank' },
      { id: 'authorId', title: 'author/id' },
      { id: 'authorName', title: 'author/name' },
      { id: 'commentCount', title: 'Total Comments' },
      { id: 'profileUrl', title: 'Profile URL' }
    ]
  });

  const leaderboardRecords = leaderboard.map((item, index) => ({
    rank: index + 1,
    authorId: item.authorId,
    authorName: item.authorName,
    commentCount: item.commentCount,
    profileUrl: item.profileUrl
  }));

  await leaderboardWriter.writeRecords(leaderboardRecords);

  // 2. Export All Raw Comments CSV
  const commentsCsvPath = path.join(outputDir, `${prefix}_all_comments_${timestamp}.csv`);
  const commentsWriter = createObjectCsvWriter({
    path: commentsCsvPath,
    header: [
      { id: 'authorId', title: 'author/id' },
      { id: 'authorName', title: 'author/name' },
      { id: 'text', title: 'text' },
      { id: 'commentUrl', title: 'commentUrl' },
      { id: 'date', title: 'date' }
    ]
  });

  const commentsRecords = comments.map(c => ({
    authorId: c['author/id'] || c.authorId || '',
    authorName: c['author/name'] || c.authorName || '',
    text: c.text || '',
    commentUrl: c.commentUrl || '',
    date: c.date || c.timestamp || ''
  }));

  await commentsWriter.writeRecords(commentsRecords);

  // 3. Export JSON summary
  const jsonPath = path.join(outputDir, `${prefix}_summary_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    totalCommentsScraped: comments.length,
    totalUniqueCommenters: leaderboard.length,
    topCommenter: leaderboard[0] || null,
    leaderboard: leaderboardRecords,
    allComments: commentsRecords
  }, null, 2));

  logSuccess(`Leaderboard exported to CSV: ${leaderboardCsvPath}`);
  logSuccess(`Full comments exported to CSV: ${commentsCsvPath}`);
  logSuccess(`JSON data report exported: ${jsonPath}`);

  return {
    leaderboardCsvPath,
    commentsCsvPath,
    jsonPath
  };
}
