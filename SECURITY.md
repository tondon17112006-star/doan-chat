# Security notes

## Reporting

Please report vulnerabilities privately to the project maintainers. Do not include
tokens, passwords, private messages or uploaded files in a public issue.

## Current dependency advisory

The client pins React Router DOM 7.18.1. npm currently reports
`GHSA-qwww-vcr4-c8h2`, an advisory affecting React Router's RSC server-action
handling. Lumina uses browser-only `BrowserRouter`, declarative routes and a
separate Express REST API; it does not enable React Server Components, framework
actions, route actions or server rendering. The affected code path is therefore
not exposed by this application.

Upgrade React Router as soon as a patched 7.x release is available. Other
production dependencies are expected to pass the high-severity audit threshold.

## Production checklist

- Replace both JWT secrets with independent, randomly generated values.
- Use HTTPS and a trusted reverse proxy.
- Configure MongoDB and Redis authentication and network allowlists.
- Store uploads in private object storage with malware scanning.
- Configure SMTP credentials and remove development OTP responses.
- Restrict `CLIENT_URL` to the production origin.
- Rotate access, refresh and AI provider credentials regularly.
