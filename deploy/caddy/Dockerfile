# Caddy plus the rate-limit module. Stock Caddy has no rate_limit directive.
FROM caddy:2.10.2-builder-alpine AS builder

RUN xcaddy build v2.10.2 \
    --with github.com/mholt/caddy-ratelimit@v0.1.0

FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
