// Package migrations embeds the goose SQL migrations into the binary, so every image
// carries exactly the schema it was built and tested with.
package migrations

import "embed"

// FS contains every migration file in version order.
//
//go:embed *.sql
var FS embed.FS
