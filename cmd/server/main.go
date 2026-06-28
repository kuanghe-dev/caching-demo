package main

import (
	"net/http"

	cachingdemo "github.com/kuanghe-dev/caching-demo"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/kuanghe-dev/caching-demo/internal/cache"
	"github.com/kuanghe-dev/caching-demo/internal/db"
	"github.com/kuanghe-dev/caching-demo/internal/handler"
	"github.com/kuanghe-dev/caching-demo/internal/sse"
)

func main() {
	broker := sse.NewBroker()
	database := db.New()
	c := cache.NewMemoryCache()
	h := handler.New(c, database, broker)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/events", h.Events)
	r.Get("/api/products/{id}", h.GetProduct)
	r.Post("/api/products/{id}", h.UpdateProduct)
	r.Get("/api/config", h.GetConfig)
	r.Post("/api/config", h.UpdateConfig)

	// Serve embedded frontend static files at "/".
	r.Handle("/*", cachingdemo.StaticHandler())

	http.ListenAndServe(":8080", r)
}
