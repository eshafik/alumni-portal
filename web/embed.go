// Package web embeds the built frontend (web/dist, produced by `npm run build`) so the Go
// binary can serve it directly — this is what makes single-binary deployment possible.
package web

import "embed"

//go:embed all:dist
var DistFS embed.FS
