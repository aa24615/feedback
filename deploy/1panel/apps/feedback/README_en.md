# FeedbackWall (Open Source Edition)

A self-hosted user feedback collection and management system. Create multiple products,
each with its own public feedback board to collect ideas, bugs and questions, then close
the loop with votes, comments, official replies, status workflows and dashboards.

## Getting started

1. Open `http://SERVER_IP:PORT/#/login` after installation (the app uses hash routing).
2. Sign in with the **Admin Email / Admin Password** you entered in the install form.
   The admin account is created on first boot, so you can log in and start right away.
3. Create a product; its public board is at `http://SERVER_IP:PORT/#/p/{slug}`.

## Features

- Feedback: categories, tags, attachments (images / video), contact info
- Interaction: voting, comments, official replies, pin / hide / private
- Management: status workflow, dashboard & stats, CSV export
- Notifications: SMTP email, Webhook, DingTalk / WeCom / Feishu bots
- Open capabilities: API tokens, FAQ, changelog, iframe / widget embedding
- Storage: local disk (default), Tencent COS, Alibaba OSS

## Data & ports

| Item | Detail |
| --- | --- |
| HTTP port | Set in the install form, default 8081 |
| MySQL | Bundled, reachable inside the container network only; data at `./data/mysql` |
| Uploads | Bind-mounted at `./data/uploads` |
| Parameters | View / edit in the 1Panel app detail page |

`./data` is a bind mount: uninstalling or `docker compose down` keeps your data.
Back up both `./data/mysql` and `./data/uploads`.

## Notes

- Hash-based routing (`#`) — never rewrite the domain to a real sub-path.
- When binding a domain via 1Panel reverse proxy, update **Public URL** to the real
  domain, otherwise link / image URL fallback points to `127.0.0.1`.
- Asset URLs are derived from the incoming public host (pass `Host` / `X-Forwarded-Host`).
- CORS reflects the request Origin, so public boards can be embedded on third-party sites.
- A separate API domain requires rebuilding the web image with `VITE_API_BASE_URL`
  (baked into static assets at build time).

## Links

- Source & docs: <https://github.com/aa24615/feedback>
- Issues: <https://github.com/aa24615/feedback/issues>
