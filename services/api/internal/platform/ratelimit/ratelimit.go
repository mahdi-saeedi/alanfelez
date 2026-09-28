// Package ratelimit is a fixed-window counter in Redis (key `rl:{scope}:{id}`, DATA_MODEL §4). It protects
// anonymous write endpoints such as the contact form. If Redis is down it fails open: the endpoint keeps working
// and the error is logged by the caller.
package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Limiter counts hits per key and window.
type Limiter interface {
	// Allow records a hit for scope/id and reports whether it is within limit hits per window.
	Allow(ctx context.Context, scope, id string, limit int, window time.Duration) (bool, error)
}

// Redis is a Limiter on a Redis client.
type Redis struct{ rdb *redis.Client }

// NewRedis returns a Redis-backed limiter.
func NewRedis(rdb *redis.Client) *Redis { return &Redis{rdb: rdb} }

// Allow implements Limiter.
func (r *Redis) Allow(ctx context.Context, scope, id string, limit int, window time.Duration) (bool, error) {
	key := fmt.Sprintf("rl:%s:%s:%d", scope, id, time.Now().Unix()/int64(window.Seconds()))
	pipe := r.rdb.TxPipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, window)
	if _, err := pipe.Exec(ctx); err != nil {
		return true, fmt.Errorf("ratelimit: %w", err)
	}
	return incr.Val() <= int64(limit), nil
}

// None never limits (tests, or when no Redis is configured).
type None struct{}

// Allow implements Limiter.
func (None) Allow(context.Context, string, string, int, time.Duration) (bool, error) {
	return true, nil
}
