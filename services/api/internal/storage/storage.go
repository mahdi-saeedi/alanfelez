// Package storage keeps uploaded files (article videos) in S3-compatible object storage: ArvanCloud Object Storage in
// staging and production (client, 2026-11-04). The bucket is private. Browsers upload straight to it with a signed
// PUT link (large files never pass through the API or the ingress) and play files through signed GET links, so a
// locked article's video is as locked as its text.
package storage

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/alanfelez/alanfelez/services/api/internal/platform/config"
)

// ErrNotFound means no object with that key.
var ErrNotFound = errors.New("storage: no such object")

// Store is one bucket.
type Store struct {
	client *minio.Client
	bucket string
}

// Object is what the store knows about an uploaded file.
type Object struct {
	Size        int64
	ContentType string
}

// New connects to the bucket; nil (and no error) when storage isn't configured.
func New(c config.Storage) (*Store, error) {
	if !c.Enabled() {
		return nil, nil //nolint:nilnil // "not configured" is not an error: the feature is simply off
	}
	cl, err := minio.New(c.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""),
		Secure: !c.Insecure,
		Region: c.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: %w", err)
	}
	return &Store{client: cl, bucket: c.Bucket}, nil
}

// PresignPut is a link the browser PUTs one file to, valid for ttl.
func (s *Store) PresignPut(ctx context.Context, key string, ttl time.Duration) (string, error) {
	u, err := s.client.PresignedPutObject(ctx, s.bucket, key, ttl)
	if err != nil {
		return "", fmt.Errorf("storage: sign upload: %w", err)
	}
	return u.String(), nil
}

// PresignGet is a link to read one file, valid for ttl.
func (s *Store) PresignGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	u, err := s.client.PresignedGetObject(ctx, s.bucket, key, ttl, url.Values{})
	if err != nil {
		return "", fmt.Errorf("storage: sign download: %w", err)
	}
	return u.String(), nil
}

// Stat describes an uploaded file (ErrNotFound if there's none).
func (s *Store) Stat(ctx context.Context, key string) (Object, error) {
	info, err := s.client.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return Object{}, ErrNotFound
		}
		return Object{}, fmt.Errorf("storage: stat: %w", err)
	}
	return Object{Size: info.Size, ContentType: info.ContentType}, nil
}

// Remove deletes a file (no error if it's already gone).
func (s *Store) Remove(ctx context.Context, key string) error {
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("storage: remove: %w", err)
	}
	return nil
}
