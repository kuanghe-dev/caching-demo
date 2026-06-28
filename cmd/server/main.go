package main

import (
	"encoding/json"
	"net/http"

	cachingdemo "github.com/kuanghe-dev/caching-demo"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	})

	// Serve embedded frontend static files at "/"
	r.Handle("/*", cachingdemo.StaticHandler())

	http.ListenAndServe(":8080", r)
}
