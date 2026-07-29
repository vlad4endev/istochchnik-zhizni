-- Coordinator Telegram mailing scenarios (assignment / missing need / weekly list)
ALTER TABLE global_settings
  ADD COLUMN IF NOT EXISTS telegram_coordinator_scenarios_json JSONB;
