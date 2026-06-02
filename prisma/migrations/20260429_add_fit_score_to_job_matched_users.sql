-- Migration: add fit_score column to job_matched_users
-- AC2: job_matched_users มี fit_score column
-- Stores FitScore Phase 1 result as a percentage (0.00–100.00)

ALTER TABLE job_matched_users
  ADD COLUMN fit_score DECIMAL(5, 2) NULL AFTER user_id;
