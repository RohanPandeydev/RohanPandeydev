import { writeFileSync } from "node:fs";

const accounts = [
  { user: "RohanPandeydev", token: process.env.METRICS_TOKEN },
  { user: "rohanpandey-gss", token: process.env.METRICS_TOKEN_WORK },
];

for (const a of accounts) {
  if (!a.token) {
    console.error(`Missing token for ${a.user}`);
    process.exit(1);
  }
}

async function fetchUserStats({ user, token }) {
  const query = `
    query($user: String!) {
      user(login: $user) {
        login
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          totalPullRequestReviewContributions
          restrictedContributionsCount
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]) {
          totalCount
        }
        pullRequests(states: MERGED) { totalCount }
        repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
          totalCount
          nodes { stargazerCount }
        }
        followers { totalCount }
      }
    }
  `;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "combined-stats",
    },
    body: JSON.stringify({ query, variables: { user } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user;
}

const totals = {
  commits: 0,
  prs: 0,
  mergedPRs: 0,
  issues: 0,
  reviews: 0,
  privateContribs: 0,
  contributedRepos: 0,
  ownedRepos: 0,
  stars: 0,
  followers: 0,
};

const calendarByDate = new Map();

for (const a of accounts) {
  const u = await fetchUserStats(a);
  const c = u.contributionsCollection;
  totals.commits += c.totalCommitContributions;
  totals.prs += c.totalPullRequestContributions;
  totals.issues += c.totalIssueContributions;
  totals.reviews += c.totalPullRequestReviewContributions;
  totals.privateContribs += c.restrictedContributionsCount;
  totals.contributedRepos += u.repositoriesContributedTo.totalCount;
  totals.mergedPRs += u.pullRequests.totalCount;
  totals.ownedRepos += u.repositories.totalCount;
  totals.stars += u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
  totals.followers += u.followers.totalCount;
  for (const week of c.contributionCalendar.weeks) {
    for (const day of week.contributionDays) {
      calendarByDate.set(
        day.date,
        (calendarByDate.get(day.date) ?? 0) + day.contributionCount,
      );
    }
  }
  console.log(`${u.login}:`, {
    totalCommits: c.totalCommitContributions,
    private: c.restrictedContributionsCount,
  });
}

const fmt = (n) => n.toLocaleString("en-US");
const updated = new Date().toUTCString();

const rows = [
  ["Total Commits (this year)", fmt(totals.commits)],
  ["Private Contributions", fmt(totals.privateContribs)],
  ["Total PRs", fmt(totals.prs)],
  ["Merged PRs", fmt(totals.mergedPRs)],
  ["Issues Opened", fmt(totals.issues)],
  ["PR Reviews", fmt(totals.reviews)],
  ["Repos Contributed To", fmt(totals.contributedRepos)],
  ["Repos Owned", fmt(totals.ownedRepos)],
  ["Total Stars Earned", fmt(totals.stars)],
  ["Followers", fmt(totals.followers)],
];

const W = 520;
const ROW_H = 32;
const PAD_TOP = 90;
const H = PAD_TOP + rows.length * ROW_H + 50;

const rowsSvg = rows
  .map((r, i) => {
    const y = PAD_TOP + i * ROW_H + 8;
    return `
    <g transform="translate(0,${y})">
      <text x="30" y="16" class="label">${r[0]}</text>
      <text x="${W - 30}" y="16" class="value" text-anchor="end">${r[1]}</text>
      <line x1="30" y1="26" x2="${W - 30}" y2="26" class="divider"/>
    </g>`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img">
  <title>Combined GitHub Stats — RohanPandeydev + rohanpandey-gss</title>
  <style>
    .bg { fill: #1a1b27; }
    .border { stroke: #2d2f3a; stroke-width: 1; fill: none; }
    .title { fill: #70a5fd; font: 600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .subtitle { fill: #a9b1d6; font: 400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .label { fill: #c5cbe3; font: 500 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .value { fill: #bf91f3; font: 600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .divider { stroke: #2d2f3a; stroke-width: 0.5; }
    .footer { fill: #6b7392; font: 400 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <rect class="bg" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10"/>
  <rect class="border" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10"/>
  <text x="30" y="42" class="title">Combined GitHub Stats</text>
  <text x="30" y="62" class="subtitle">@RohanPandeydev + @rohanpandey-gss · same dev</text>
  ${rowsSvg}
  <text x="30" y="${H - 18}" class="footer">Updated ${updated}</text>
</svg>`;

writeFileSync("combined-stats.svg", svg);
console.log("\nTotals:", totals);
console.log("\ncombined-stats.svg written");

// ── Combined contribution heatmap ────────────────────────────────────
const dates = [...calendarByDate.keys()].sort();
const startDate = new Date(dates[0]);
const endDate = new Date(dates[dates.length - 1]);

const dayMs = 24 * 60 * 60 * 1000;
const gridStart = new Date(startDate);
gridStart.setDate(gridStart.getDate() - gridStart.getDay());
const totalDays = Math.round((endDate - gridStart) / dayMs) + 1;
const totalWeeks = Math.ceil(totalDays / 7);

const cell = 12;
const gap = 3;
const leftPad = 36;
const topPad = 60;
const rightPad = 20;
const bottomPad = 30;
const gridW = totalWeeks * (cell + gap) - gap;
const gridH = 7 * (cell + gap) - gap;
const HW = leftPad + gridW + rightPad;
const HH = topPad + gridH + bottomPad;

const levelColor = (n) => {
  if (n === 0) return "#161b22";
  if (n < 4) return "#0e4429";
  if (n < 10) return "#006d32";
  if (n < 20) return "#26a641";
  return "#39d353";
};

const cells = [];
const monthLabels = new Map();
for (let w = 0; w < totalWeeks; w++) {
  for (let d = 0; d < 7; d++) {
    const date = new Date(gridStart.getTime() + (w * 7 + d) * dayMs);
    if (date < startDate || date > endDate) continue;
    const iso = date.toISOString().slice(0, 10);
    const count = calendarByDate.get(iso) ?? 0;
    const x = leftPad + w * (cell + gap);
    const y = topPad + d * (cell + gap);
    cells.push(
      `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${levelColor(count)}"><title>${iso}: ${count} contributions</title></rect>`,
    );
    if (date.getDate() <= 7 && d === 0) {
      monthLabels.set(
        x,
        date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      );
    }
  }
}

const monthLabelsSvg = [...monthLabels.entries()]
  .map(
    ([x, m]) =>
      `<text x="${x}" y="${topPad - 8}" class="month">${m}</text>`,
  )
  .join("");

const dayLabelsSvg = ["Mon", "Wed", "Fri"]
  .map((label, i) => {
    const y = topPad + (i * 2 + 1) * (cell + gap) + cell - 2;
    return `<text x="${leftPad - 8}" y="${y}" text-anchor="end" class="day">${label}</text>`;
  })
  .join("");

const totalCombinedDays = [...calendarByDate.values()].reduce(
  (s, v) => s + v,
  0,
);

const heatmapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${HW}" height="${HH}" viewBox="0 0 ${HW} ${HH}" role="img">
  <title>Combined contribution heatmap — RohanPandeydev + rohanpandey-gss</title>
  <style>
    .bg { fill: #0d1117; }
    .border { stroke: #21262d; stroke-width: 1; fill: none; }
    .title { fill: #c9d1d9; font: 600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .subtitle { fill: #8b949e; font: 400 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .month { fill: #8b949e; font: 400 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .day { fill: #8b949e; font: 400 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .legend { fill: #8b949e; font: 400 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <rect class="bg" x="0.5" y="0.5" width="${HW - 1}" height="${HH - 1}" rx="6"/>
  <rect class="border" x="0.5" y="0.5" width="${HW - 1}" height="${HH - 1}" rx="6"/>
  <text x="${leftPad}" y="24" class="title">${totalCombinedDays.toLocaleString("en-US")} contributions in the last year</text>
  <text x="${leftPad}" y="42" class="subtitle">Combined activity from @RohanPandeydev + @rohanpandey-gss</text>
  ${monthLabelsSvg}
  ${dayLabelsSvg}
  ${cells.join("\n")}
  <g transform="translate(${HW - rightPad - 130},${HH - 12})">
    <text x="0" y="0" class="legend">Less</text>
    <rect x="28" y="-10" width="${cell}" height="${cell}" rx="2" fill="${levelColor(0)}"/>
    <rect x="${28 + (cell + gap) * 1}" y="-10" width="${cell}" height="${cell}" rx="2" fill="${levelColor(2)}"/>
    <rect x="${28 + (cell + gap) * 2}" y="-10" width="${cell}" height="${cell}" rx="2" fill="${levelColor(5)}"/>
    <rect x="${28 + (cell + gap) * 3}" y="-10" width="${cell}" height="${cell}" rx="2" fill="${levelColor(15)}"/>
    <rect x="${28 + (cell + gap) * 4}" y="-10" width="${cell}" height="${cell}" rx="2" fill="${levelColor(25)}"/>
    <text x="${28 + (cell + gap) * 5 + 6}" y="0" class="legend">More</text>
  </g>
</svg>`;

writeFileSync("combined-contributions.svg", heatmapSvg);
console.log(
  `combined-contributions.svg written (${totalCombinedDays} total contributions)`,
);
