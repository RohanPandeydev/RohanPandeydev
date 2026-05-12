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
  console.log(`${u.login}:`, c);
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
