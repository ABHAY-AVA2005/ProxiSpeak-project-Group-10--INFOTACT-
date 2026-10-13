# 04 - GitHub Rules (Mandatory)

## Branch rules
| Rule | Description |
|---|---|
| Main branch | Used only for progress tracking. Holds the final merged code from all members. |
| Individual branches | Each member has their OWN dedicated branch. |
| Commit requirement | Each member must show commit activity in THEIR OWN branch. |
| Merge to main | The Team Lead reviews and merges individual branches into main. |
| Solo worker | A solo worker may commit directly to main. (Not our case: we are a team of 4.) |

## Our branches
`abhay-team-lead` (lead), `tanvi-frontend`, `abhishek-audio`, `kajal-backend`

## What counts as a valid commit
**Valid:** code changes, documentation updates, README updates, configuration changes, assets (images, icons), merge commits.
**Invalid:** empty commits, single-character changes (gaming the system), identical commits duplicated across days, auto-generated spam commits, commits with no meaningful content, commits not in your own branch (team mode).

## Commit frequency requirements
- **Mid review:** commits on at least 10 different days in the 14 days before it (we target every day).
- **Final review:** commits on all 20 days before it, no gaps.
- If a member is unresponsive for 48 hours, report them and continue; the 20-day rule still applies to the team.
- GitHub is mandatory for all domains except UI/UX (Figma only).

## Team Lead responsibilities (Abhay)
- Ensure the repository is created, shared, and commits happen daily.
- Ensure each member has their own branch and actively commits to it.
- Assign week-wise tasks to members (see `02_TEAM_PLAN.md`).
- Ensure the repository is connected to the project dashboard.
- Review pull requests and merge member branches into main.

## Our commit conventions
Message format: `type: short meaning`
Types: `feat`, `fix`, `docs`, `test`, `chore`, `perf`, `refactor`.
Examples:
- `feat: add $near query for users within 100px`
- `docs: add WebRTC flow diagram to README`
- `test: add fake-client load script for 50 users`

## Daily Git workflow
```bash
git checkout your-branch-name   # e.g. tanvi-frontend
git pull origin your-branch-name
# work, then
git add .
git commit -m "feat: short meaning"
git push origin your-branch-name
```
Weekly: open a pull request from your branch to `main`; Abhay reviews and merges. Keep `main` stable. Never commit `.env` or secrets (add to `.gitignore`).

## Daily rules
- Commit before 9 PM every day, including weekends.
- If blocked, still commit something meaningful (docs, tests, cleanup). Never make empty or fake commits.
- Do not commit on someone else's branch.
