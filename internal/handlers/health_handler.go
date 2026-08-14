package handlers

import (
	"net/http"

	"github.com/jmoiron/sqlx"

	"alumni-portal/internal/httpx"
)

type HealthHandler struct {
	DB *sqlx.DB
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	if err := h.DB.Ping(); err != nil {
		httpx.JSON(w, http.StatusServiceUnavailable, map[string]string{"status": "down", "error": err.Error()})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
