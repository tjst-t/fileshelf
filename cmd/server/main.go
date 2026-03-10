package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/tjst-t/fileshelf/internal/config"
	"github.com/tjst-t/fileshelf/internal/fileop"
	"github.com/tjst-t/fileshelf/internal/server"
)

func main() {
	configPath := flag.String("config", "config.yaml", "path to config file")
	port := flag.Int("port", 0, "override listen port (e.g. 8080)")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error loading config: %v\n", err)
		os.Exit(1)
	}

	if *port > 0 {
		cfg.Server.Listen = fmt.Sprintf(":%d", *port)
	}

	fop := &fileop.ForkFileOperator{
		HelperPath: cfg.Helper.Path,
		Bases:      cfg.ShareBasePaths(),
		Timeout:    cfg.Helper.Timeout,
	}

	router := server.NewRouter(cfg, fop)

	srv := &http.Server{
		Addr:    cfg.Server.Listen,
		Handler: router,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		mode := "production"
		if cfg.Server.DevMode {
			mode = "dev (user: " + cfg.Server.DevUser + ")"
		}
		log.Printf("fileshelf-server starting on %s [%s]", cfg.Server.Listen, mode)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-done
	log.Println("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown error: %v", err)
	}
	log.Println("server stopped")
}
