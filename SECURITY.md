# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, email **glebstar06@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce (if you can)
- The affected version / commit SHA
- Your assessment of impact (data exposure, auth bypass, RCE, etc.)

You'll get an acknowledgement within 72 hours. If the issue is confirmed:

- For critical issues (auth bypass, data leak, RCE): a fix will land within 7 days
- For lower-severity issues: a fix will land in the next regular release

We don't currently offer a bug bounty, but we'll credit you in the release notes if you'd like.

## Scope

In scope:

- Anything in this repository (`glebstarchikov/Launchpad`)
- The reference deployment at [launchpad.starco-tools.nl](https://launchpad.starco-tools.nl)

Out of scope:

- Self-hosted instances run by third parties (not our infra; report to the operator)

## What counts as a vulnerability

Clear cases: auth bypass, SQL injection, remote code execution, privilege escalation, data leaks of another user's records.

Less clear cases worth reporting anyway: CSRF in authenticated endpoints, missing ownership checks, XSS in user-generated content, cookie misconfig. We'll triage.

Not a vulnerability: missing rate limits (we rely on network-level protection), default JWT_SECRET in `.env.example` (it's a placeholder — production use with that value is operator error and is documented as such), the single-user registration gate (by design).
