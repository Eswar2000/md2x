---
title: Rate Limiting with Token Buckets
author: Priya Nair
subject: An implementer's guide to the token bucket algorithm
keywords: rate limiting, token bucket, api, backend, throttling
date: 2026-07-11
---

# Rate Limiting with Token Buckets

Every public API eventually meets a client that asks for too much, too fast —
a runaway script, an over-eager crawler, or a paying customer whose retry loop
has gone feral. **Rate limiting** is how you protect a service from that load
without simply falling over. Of the handful of algorithms in common use, the
*token bucket* is the one most teams reach for, because it is small, fair, and
allows short bursts while still enforcing a steady long-run rate.

This guide builds a token bucket from first principles, implements it in three
languages, and then wires it into configuration, testing, and observability so
you can run it in production with confidence.

## Table of Contents

- [Why Rate Limit](#why-rate-limit)
- [The Token Bucket Algorithm](#the-token-bucket-algorithm)
- [Configuration](#configuration)
- [Trying It Out](#trying-it-out)
- [Observability](#observability)
- [Choosing Limits](#choosing-limits)

## Why Rate Limit

Without a limiter, a single client can consume all of a server's CPU, database
connections, or downstream quota, degrading the service for everyone else. A
good limiter turns that failure mode into a polite `429 Too Many Requests` and a
`Retry-After` header, so well-behaved clients back off and misbehaving ones are
contained.

> [!NOTE]
> Rate limiting is a *availability* control, not a *security* control. It slows
> abuse down, but it is not a substitute for authentication or authorization.

## The Token Bucket Algorithm

Picture a bucket that holds up to `capacity` tokens and is refilled at a fixed
`refillPerSecond`. Every request must remove one token before it is served; if
the bucket is empty, the request is rejected. Because the bucket can be full,
a client that has been quiet may spend a *burst* of requests at once, but over
time it can never exceed the refill rate.

The whole algorithm is three numbers — current tokens, capacity, and the last
refill time — plus a tiny bit of arithmetic on each request.

### In TypeScript

```ts
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Spend `cost` tokens; returns false when the bucket is too empty. */
  take(cost = 1): boolean {
    this.refill();
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
  }
}
```

Notice that we never run a timer: refilling *lazily* on each call is both
cheaper and more accurate than waking up on an interval.

### In Python

The same design translates directly, using `time.monotonic()` so the clock
cannot run backwards when the wall clock is adjusted.

```python
import time
from dataclasses import dataclass, field


@dataclass
class TokenBucket:
    capacity: float
    refill_per_second: float
    _tokens: float = field(init=False)
    _last: float = field(default_factory=time.monotonic, init=False)

    def __post_init__(self) -> None:
        self._tokens = self.capacity

    def take(self, cost: float = 1.0) -> bool:
        now = time.monotonic()
        self._tokens = min(
            self.capacity,
            self._tokens + (now - self._last) * self.refill_per_second,
        )
        self._last = now
        if self._tokens < cost:
            return False
        self._tokens -= cost
        return True
```

### In Go

In a concurrent server the bucket is shared across goroutines, so this version
guards its state with a mutex.

```go
package ratelimit

import (
	"sync"
	"time"
)

// Bucket is a goroutine-safe token bucket.
type Bucket struct {
	mu       sync.Mutex
	tokens   float64
	capacity float64
	rate     float64 // tokens per second
	last     time.Time
}

func New(capacity, rate float64) *Bucket {
	return &Bucket{tokens: capacity, capacity: capacity, rate: rate, last: time.Now()}
}

// Take spends cost tokens, returning false when the bucket is empty.
func (b *Bucket) Take(cost float64) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	b.tokens = min(b.capacity, b.tokens+now.Sub(b.last).Seconds()*b.rate)
	b.last = now
	if b.tokens < cost {
		return false
	}
	b.tokens -= cost
	return true
}
```

## Configuration

Limits belong in configuration, not code, so you can tune them without a
deploy. A small JSON document is enough to describe per-route buckets and the
response headers you want to advertise.

```json
{
  "limits": {
    "default": { "capacity": 60, "refillPerSecond": 1 },
    "search":  { "capacity": 10, "refillPerSecond": 0.5 }
  },
  "headers": {
    "remaining": "X-RateLimit-Remaining",
    "retryAfter": "Retry-After"
  }
}
```

When the limiter runs behind Kubernetes, the same numbers usually surface as
environment variables on the gateway deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: gateway
          image: registry.example.com/gateway:1.4.2
          env:
            - name: RATE_LIMIT_DEFAULT
              value: "60"
```

## Trying It Out

The fastest way to convince yourself the limiter works is to exceed it on
purpose and count the status codes that come back.

```bash
# Fire 20 quick requests and tally the HTTP status codes
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://api.example.com/v1/search?q=bread"
done | sort | uniq -c
```

> [!WARNING]
> Never load-test a shared staging environment without telling the team first.
> A burst big enough to prove your limiter works is also big enough to page
> whoever is on call.

## Observability

A limiter you cannot see is a limiter you cannot trust. Log every rejection with
the client id and the route, then keep a query handy to spot who is hitting the
wall most often.

```sql
-- Clients throttled most in the last hour
SELECT client_id,
       COUNT(*) AS throttled
FROM   request_log
WHERE  status = 429
  AND  created_at >= now() - interval '1 hour'
GROUP  BY client_id
ORDER  BY throttled DESC
LIMIT  10;
```

> [!TIP]
> Export `throttled` as a metric alongside the raw counts. An alert on a sudden
> spike catches both runaway clients *and* a limit you accidentally set too low.

## Choosing Limits

There is no universal number; the right limit depends on how expensive the
route is and how bursty legitimate traffic looks. The table below is a sane
starting point you can adjust once you have real traffic.

| Route            | Capacity | Refill / sec | Rationale                        |
| ---------------- | -------: | -----------: | -------------------------------- |
| `GET /health`    |      120 |           10 | Cheap; keep it generous          |
| `GET /search`    |       10 |          0.5 | Expensive; protect the database  |
| `POST /login`    |        5 |         0.05 | Throttle credential-stuffing[^cs] |

Start loose, watch the `429` rate, and tighten only the routes that actually
hurt. A limiter that rejects honest traffic is worse than none at all.

[^cs]: Credential stuffing is an attack that replays leaked username/password
    pairs against a login endpoint. A tight bucket on `POST /login` will not
    stop it outright, but it raises the cost enough that most bots move on.

---

Written with `md2x`. Measure first, then limit — never the other way around.
