# Chair

**The boardroom does the work. You still run the room.**

A free bonus tool built for the Click Staff AI launch (11–16 September 2026).

Click Staff AI automates the middle of a business project — you give one command,
a boardroom of AI specialists debates and cross-reviews, one finished deliverable
comes out. Its own sales page says three separate times that the work on either
side stays yours: deciding what to ask for, judging what comes back, and shipping
it. Chair is the app for those three jobs.

Live at **https://chair.misanmorrison.com**

## What's in it

Nine tools across three modules, plus a How to Use tab.

**Brief — write the command worth giving**

| Tool | What it does |
|---|---|
| Command Composer | Project-type-driven brief builder. Assembles one paste-ready command plus a reusable context block. |
| Scope Splitter | Weighted breadth score deciding one boardroom or several, then writes each phase command in run order. |
| Blank-Screen Breaker | Ranks 14 candidate missions on impact × readiness × horizon fit × effort, returns a shortlist written for your business. |

**Verdict — judge what the boardroom returns**

| Tool | What it does |
|---|---|
| Deliverable Scorecard | Per-asset-type weighted rubric across 8 deliverable types. Ends in ship / fix first / send back, with a send-back command naming the weak points. |
| Claim Auditor | Ten tiered pattern rules for risky claim types, each with a severity, a reason and a safer rewrite. |
| Voice Drift Checker | Flesch–Kincaid grade, sentence-length spread, CTA consistency and hard-fact mismatches across 2–8 assets. |

**Runway — get it shipped, and count what it was worth**

| Tool | What it does |
|---|---|
| Launch Runway | Back-schedules delivered assets from cart open using per-asset lead times. Warns when the window can't hold the plan. |
| Ship Tracker | Produced vs. actually shipped, with overdue flagging. Won't let you mark something live that the Scorecard sent back. |
| Command Ledger | Values each command at hours × the combined market rate of the specialists it replaced. |

## Technical notes

Plain HTML, CSS and JavaScript. No build step, no framework, no dependencies,
no external requests of any kind.

- **No API calls and no keys.** Every "smart" output is a deterministic rule
  engine or a template merge running in the browser.
- **No accounts and no server.** All state lives in `localStorage`, in the
  visitor's own browser. Nothing is transmitted anywhere.
- **Per-browser storage.** Work doesn't sync across devices, and clearing
  browser data clears it. The How to Use tab says so plainly.

### Cross-tool wiring

Tools hand off to each other rather than standing alone: Blank-Screen Breaker
sends a chosen mission into Command Composer pre-filled; Composer feeds Scope
Splitter; the Scorecard's verdicts are read by Ship Tracker to block premature
"live" marks; Launch Runway populates Ship Tracker's pipeline; the Command
Ledger reconciles across all of it. A shared **My Business** profile removes
retyping across Composer and Breaker.

### Password gate

The site is behind a client-side SHA-256 password check. This is a **soft
deterrent, not security** — it keeps the page out of search results and casual
hands, and anyone with browser dev tools can bypass it. Nothing sensitive lives
here, and the plaintext password is never committed to this repository.

## Hosting

GitHub Pages via Actions (`.github/workflows/pages.yml`), deploying on pushes to
`main`. The custom domain is set in the repo's Pages settings with the `CNAME`
file at the root; DNS is a `CNAME` record pointing `chair` at
`miskoblog.github.io`.

---

Built by [Misan Morrison](https://misanmorrison.com/).
