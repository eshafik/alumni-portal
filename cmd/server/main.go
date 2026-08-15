package main

import (
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"alumni-portal/internal/auth"
	"alumni-portal/internal/config"
	"alumni-portal/internal/db"
	"alumni-portal/internal/handlers"
	"alumni-portal/internal/httpx"
	"alumni-portal/internal/mailer"
	"alumni-portal/internal/models"
	"alumni-portal/internal/storage"
	web "alumni-portal/web"
)

func main() {
	cfg := config.Load()

	dbx, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer dbx.Close()

	if err := db.Migrate(dbx); err != nil {
		log.Fatalf("db migrate: %v", err)
	}

	if err := db.SeedInstitution(dbx, "My Institution", "my-institution"); err != nil {
		log.Fatalf("seed institution: %v", err)
	}
	var institutionID int64
	if err := dbx.Get(&institutionID, `SELECT id FROM institutions LIMIT 1`); err == nil {
		if err := db.SeedBloodGroups(dbx, institutionID); err != nil {
			log.Fatalf("seed blood groups: %v", err)
		}
		if cfg.SuperAdminEmail != "" {
			hash, hashErr := auth.HashPassword(cfg.SuperAdminPassword)
			if hashErr != nil {
				log.Fatalf("hash superadmin password: %v", hashErr)
			}
			if err := db.SeedSuperAdmin(dbx, institutionID, cfg.SuperAdminEmail, hash); err != nil {
				log.Fatalf("seed superadmin: %v", err)
			}
		}
	}

	store, err := storage.New(cfg)
	if err != nil {
		log.Fatalf("storage init: %v", err)
	}

	sender := mailer.NewSender(cfg)
	stopMailer := make(chan struct{})
	go sender.Run(dbx, 5*time.Second, stopMailer)

	secureCookies := cfg.AppEnv == "production"

	authHandler := &handlers.AuthHandler{DB: dbx, Secure: secureCookies}
	institutionHandler := &handlers.InstitutionHandler{DB: dbx, Storage: store, Timezone: cfg.Timezone}
	healthHandler := &handlers.HealthHandler{DB: dbx}
	alumniHandler := &handlers.AlumniHandler{DB: dbx, Storage: store}
	studentHandler := &handlers.StudentHandler{DB: dbx, Storage: store}
	adminHandler := &handlers.AdminHandler{DB: dbx}
	committeeHandler := &handlers.CommitteeHandler{DB: dbx, Storage: store}
	galleryHandler := &handlers.GalleryHandler{DB: dbx, Storage: store}
	postHandler := &handlers.PostHandler{DB: dbx}
	jobHandler := &handlers.JobHandler{DB: dbx, Storage: store}
	noticeHandler := &handlers.NoticeHandler{DB: dbx, Storage: store}
	eventHandler := &handlers.EventHandler{DB: dbx, Storage: store, PublicBaseURL: cfg.PublicBaseURL}
	businessHandler := &handlers.BusinessHandler{DB: dbx}
	notificationHandler := &handlers.NotificationHandler{DB: dbx}
	uploadHandler := &handlers.UploadHandler{DB: dbx, Storage: store}

	r := httpx.NewRouter()

	requireAuth := auth.RequireAuth(dbx)

	r.Get("/api/health", healthHandler.Health)

	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/signup", authHandler.Signup)
		r.Post("/otp/verify", authHandler.VerifyOTP)
		r.Post("/otp/resend", authHandler.ResendOTP)
		r.Post("/login", authHandler.Login)
		r.Post("/logout", authHandler.Logout)
		r.Post("/password/forgot", authHandler.ForgotPassword)
		r.Post("/password/reset", authHandler.ResetPassword)
		r.With(requireAuth).Get("/me", authHandler.Me)
		r.With(requireAuth).Post("/password/change", authHandler.ChangePassword)
	})

	// Public content — no login required. Spec section 48 (Public vs Private Data): events,
	// notices, jobs, businesses, committee info, and general posts are institutional/public
	// content, not member data. Only the alumni/student directories and mutations require
	// an approved account (see the authenticated group below).
	r.Get("/api/institution", institutionHandler.GetInstitution)
	r.Get("/api/departments", institutionHandler.ListDepartments)
	r.Get("/api/programs", institutionHandler.ListPrograms)
	r.Get("/api/batches", institutionHandler.ListBatches)
	r.Get("/api/blood-groups", institutionHandler.ListBloodGroups)

	r.Get("/api/posts", postHandler.List)
	r.Get("/api/jobs", jobHandler.List)
	r.Get("/api/jobs/{id}", jobHandler.Get)
	r.With(auth.OptionalAuth(dbx)).Get("/api/notices", noticeHandler.List)
	r.With(auth.OptionalAuth(dbx)).Get("/api/notices/{id}", noticeHandler.Get)
	r.With(auth.OptionalAuth(dbx)).Get("/api/events", eventHandler.List)
	r.With(auth.OptionalAuth(dbx)).Get("/api/events/{slug}", eventHandler.Get)
	r.Get("/api/businesses", businessHandler.List)
	r.Get("/api/businesses/{id}", businessHandler.Get)
	r.Get("/api/committees", committeeHandler.List)
	r.Get("/api/committees/current", committeeHandler.Current)
	r.Get("/api/committees/{id}", committeeHandler.Get)
	r.Get("/api/home-gallery", galleryHandler.List)

	r.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(auth.RequireApproved)

		r.Get("/api/alumni", alumniHandler.List)
		r.Get("/api/alumni/{id}", alumniHandler.Get)
		r.Get("/api/alumni/me", alumniHandler.GetMe)
		r.Put("/api/alumni/me", alumniHandler.UpdateMe)

		r.Get("/api/students", studentHandler.List)
		r.Get("/api/students/me", studentHandler.GetMe)
		r.Put("/api/students/me", studentHandler.UpdateMe)

		r.Post("/api/uploads", uploadHandler.Upload)

		r.Post("/api/posts", postHandler.Create)

		r.Post("/api/jobs", jobHandler.Create)
		r.Put("/api/jobs/{id}", jobHandler.Update)
		r.Delete("/api/jobs/{id}", jobHandler.Delete)

		r.Post("/api/events/{slug}/register", eventHandler.Register)
		r.Delete("/api/events/{slug}/register", eventHandler.CancelRegistration)

		r.Post("/api/businesses", businessHandler.Create)

		r.Get("/api/notifications", notificationHandler.List)
		r.Get("/api/notifications/unread-count", notificationHandler.UnreadCount)
		r.Put("/api/notifications/{id}/read", notificationHandler.MarkRead)
		r.Get("/api/notification-preferences", notificationHandler.GetPreferences)
		r.Put("/api/notification-preferences", notificationHandler.UpdatePreference)
	})

	r.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(auth.RequireApproved)
		r.Use(auth.RequireRole(models.RoleSuperAdmin, models.RoleAdmin))

		r.Put("/api/admin/institution", institutionHandler.UpdateInstitution)
		r.Post("/api/admin/home-gallery", galleryHandler.Create)
		r.Put("/api/admin/home-gallery/{id}", galleryHandler.Update)
		r.Delete("/api/admin/home-gallery/{id}", galleryHandler.Delete)
		r.Post("/api/admin/departments", institutionHandler.CreateDepartment)
		r.Put("/api/admin/departments/{id}", institutionHandler.UpdateDepartment)
		r.Delete("/api/admin/departments/{id}", institutionHandler.DeleteDepartment)
		r.Post("/api/admin/programs", institutionHandler.CreateProgram)
		r.Put("/api/admin/programs/{id}", institutionHandler.UpdateProgram)
		r.Delete("/api/admin/programs/{id}", institutionHandler.DeleteProgram)
		r.Post("/api/admin/batches", institutionHandler.CreateBatch)
		r.Put("/api/admin/batches/{id}", institutionHandler.UpdateBatch)
		r.Delete("/api/admin/batches/{id}", institutionHandler.DeleteBatch)
		r.Post("/api/admin/batches/{id}/convert-to-alumni", adminHandler.ConvertBatchToAlumni)
		r.Post("/api/admin/batches/{id}/revert-conversion", adminHandler.RevertBatchConversion)
		r.Post("/api/admin/blood-groups", institutionHandler.CreateBloodGroup)
		r.Put("/api/admin/blood-groups/{id}", institutionHandler.UpdateBloodGroup)
		r.Delete("/api/admin/blood-groups/{id}", institutionHandler.DeleteBloodGroup)

		r.Get("/api/admin/users", adminHandler.ListUsers)
		r.Put("/api/admin/users/{id}/role", adminHandler.UpdateUserRole)
		r.Put("/api/admin/users/{id}/status", adminHandler.UpdateUserStatus)

		r.Post("/api/admin/committees", committeeHandler.CreateCommittee)
		r.Post("/api/admin/committees/{id}/positions", committeeHandler.CreatePosition)
		r.Post("/api/admin/committee-positions/{id}/members", committeeHandler.AddMember)
		r.Delete("/api/admin/committee-positions/{id}/members/{userId}", committeeHandler.RemoveMember)

		r.Put("/api/notices/{id}", noticeHandler.Update)
		r.Post("/api/notices", noticeHandler.Create)
		r.Delete("/api/notices/{id}", noticeHandler.Delete)

		r.Get("/api/admin/events/{id}", eventHandler.GetAdmin)
		r.Post("/api/admin/events", eventHandler.Create)
		r.Put("/api/admin/events/{id}", eventHandler.Update)
		r.Delete("/api/admin/events/{id}", eventHandler.Delete)
		r.Get("/api/admin/events/{id}/registrations", eventHandler.ListRegistrations)
		r.Get("/api/admin/events/{id}/registrations.csv", eventHandler.ExportRegistrationsCSV)

		r.Get("/api/admin/audit-logs", adminHandler.ListAuditLogs)
	})

	r.Group(func(r chi.Router) {
		r.Use(requireAuth)
		r.Use(auth.RequireApproved)
		r.Use(auth.RequireRole(models.RoleSuperAdmin, models.RoleAdmin, models.RoleModerator))

		r.Get("/api/moderator/pending-registrations", adminHandler.ListPendingRegistrations)
		r.Get("/api/moderator/rejected-registrations", adminHandler.ListRejectedRegistrations)
		r.Post("/api/moderator/pending-registrations/{id}/approve", adminHandler.ApproveRegistration)
		r.Post("/api/moderator/pending-registrations/{id}/reject", adminHandler.RejectRegistration)
		r.Post("/api/moderator/posts/{id}/approve", postHandler.Approve)
		r.Post("/api/moderator/posts/{id}/reject", postHandler.Reject)
	})

	// Public, unauthenticated event share metadata endpoint for social crawlers.
	r.Get("/share/events/{slug}", eventHandler.ShareMeta)

	// Local file storage serving (no-op route if STORAGE_DRIVER=s3). Storage keys are opaque
	// UUIDs minted once per upload and never overwritten (internal/storage/validate.go), so a
	// given URL's content never changes — safe to cache aggressively.
	if cfg.StorageDriver == "local" {
		fileServer := http.StripPrefix("/files/", http.FileServer(http.Dir(cfg.LocalPath)))
		r.Get("/files/*", func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			fileServer.ServeHTTP(w, req)
		})
	}

	// SPA fallback: serve built frontend assets, falling back to index.html for client-side routes.
	distFS, err := fs.Sub(web.DistFS, "dist")
	if err != nil {
		log.Fatalf("web dist sub fs: %v", err)
	}
	fileServer := http.FileServer(http.FS(distFS))
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		if _, err := fs.Stat(distFS, req.URL.Path[1:]); err != nil {
			indexHTML, err := distFS.Open("index.html")
			if err != nil {
				http.NotFound(w, req)
				return
			}
			defer indexHTML.Close()
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = io.Copy(w, indexHTML)
			return
		}
		fileServer.ServeHTTP(w, req)
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("alumni-portal listening on :%s (env=%s, storage=%s)", cfg.Port, cfg.AppEnv, cfg.StorageDriver)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	close(stopMailer)
	log.Println("shutting down")
}
