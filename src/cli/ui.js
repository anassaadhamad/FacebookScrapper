import chalk from 'chalk';
import Table from 'cli-table3';

export function printHeader() {
  console.log('\n' + chalk.bold.cyan('===================================================='));
  console.log(chalk.bold.magenta('   🚀 FACEBOOK COMMENT SCRAPER & GIVEAWAY ANALYZER   '));
  console.log(chalk.bold.cyan('====================================================\n'));
}

export function logInfo(message) {
  console.log(`${chalk.blue('ℹ')} ${message}`);
}

export function logSuccess(message) {
  console.log(`${chalk.green('✔')} ${message}`);
}

export function logWarn(message) {
  console.log(`${chalk.yellow('⚠')} ${message}`);
}

export function logError(message) {
  console.log(`${chalk.red('✖')} ${message}`);
}

export function renderLeaderboard(leaderboard, topN = 20) {
  console.log('\n' + chalk.bold.yellow(`🏆 GIVEAWAY LEADERBOARD (Top ${Math.min(topN, leaderboard.length)})`));
  
  const table = new Table({
    head: [
      chalk.cyan('Rank'),
      chalk.cyan('User ID / Identifier'),
      chalk.cyan('Author Name'),
      chalk.cyan('Comments Count'),
      chalk.cyan('% of Total')
    ],
    colWidths: [8, 25, 25, 18, 14]
  });

  const totalComments = leaderboard.reduce((acc, user) => acc + user.commentCount, 0);

  leaderboard.slice(0, topN).forEach((entry, idx) => {
    const rank = idx + 1;
    let rankStr = `${rank}`;
    if (rank === 1) rankStr = chalk.bold.gold ? chalk.bold.gold('🥇 1') : chalk.bold.yellow('🥇 1');
    else if (rank === 2) rankStr = chalk.bold.gray('🥈 2');
    else if (rank === 3) rankStr = chalk.bold.red('🥉 3');

    const percentage = totalComments > 0 ? ((entry.commentCount / totalComments) * 100).toFixed(1) + '%' : '0%';

    table.push([
      rankStr,
      entry.authorId || 'N/A',
      entry.authorName || 'Anonymous',
      chalk.bold.green(entry.commentCount),
      percentage
    ]);
  });

  console.log(table.toString());
  console.log(chalk.gray(`Total Unique Commenters: ${leaderboard.length} | Total Processed Comments: ${totalComments}\n`));
}
