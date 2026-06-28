package cachingdemo

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed all:frontend/dist
var staticFiles embed.FS

// StaticHandler returns an http.Handler that serves the embedded frontend dist files.
func StaticHandler() http.Handler {
	dist, err := fs.Sub(staticFiles, "frontend/dist")
	if err != nil {
		panic(err)
	}
	return http.FileServer(http.FS(dist))
}
