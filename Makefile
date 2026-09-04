.PHONY: migrate-up seed reset db-up

# Run migrations (requires db to be running: docker compose up -d db)
migrate-up:
	docker compose run --rm api alembic upgrade head

# Seed baseline data (run after migrate-up)
seed:
	docker compose run --rm api python -m app.seed

# Start db only (for running migrate-up + seed manually)
db-up:
	docker compose up -d db

# Full clean reset: wipe DB, migrate, seed
# Use when you've cleared migrations or want a fresh start
reset: db-up
	@echo "Waiting for db..."
	@sleep 3
	$(MAKE) migrate-up
	$(MAKE) seed
	@echo "Done. Run 'docker compose up' to start the api."
