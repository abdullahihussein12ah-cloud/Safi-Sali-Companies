-- SAFI SALI COMPANIES - Affiliate Marketing Platform
-- MySQL 8.0+ / InnoDB. Run against a new database; this does not modify the legacy MongoDB data.
-- Default commission is 10%. Monetary values use DECIMAL, never FLOAT.

CREATE TABLE businesses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  status ENUM('pending','active','suspended','closed') NOT NULL DEFAULT 'pending',
  default_currency CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_business_slug (slug),
  KEY ix_business_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin','business_admin','affiliate','finance_admin') NOT NULL,
  status ENUM('invited','active','suspended','disabled') NOT NULL DEFAULT 'invited',
  profile_image_url VARCHAR(2048) NULL,
  email_verified_at DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_business_role (business_id, role, status),
  CONSTRAINT fk_users_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE affiliate_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  affiliate_code VARCHAR(48) NOT NULL,
  payout_method VARCHAR(40) NULL,
  payout_account_ref VARCHAR(190) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_affiliate_user (user_id),
  UNIQUE KEY uq_affiliate_code (affiliate_code),
  CONSTRAINT fk_affiliate_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE commission_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NULL,
  rate_percent DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  applies_to ENUM('all_affiliates','specific_affiliate') NOT NULL DEFAULT 'all_affiliates',
  affiliate_user_id BIGINT UNSIGNED NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_until DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_commission_rule_lookup (business_id, is_active, effective_from),
  CONSTRAINT chk_commission_rate CHECK (rate_percent >= 0 AND rate_percent <= 100),
  CONSTRAINT fk_rule_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rule_affiliate FOREIGN KEY (affiliate_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rule_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE referral_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  affiliate_user_id BIGINT UNSIGNED NOT NULL,
  business_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(80) NOT NULL,
  destination_url VARCHAR(2048) NULL,
  campaign_name VARCHAR(160) NULL,
  clicks BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_referral_code (code),
  KEY ix_referral_owner (affiliate_user_id, business_id, is_active),
  CONSTRAINT fk_link_affiliate FOREIGN KEY (affiliate_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_link_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE referrals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  referral_link_id BIGINT UNSIGNED NOT NULL,
  affiliate_user_id BIGINT UNSIGNED NOT NULL,
  business_id BIGINT UNSIGNED NOT NULL,
  customer_name VARCHAR(160) NULL,
  customer_email VARCHAR(190) NULL,
  attribution_token CHAR(64) NOT NULL,
  status ENUM('clicked','registered','converted','rejected') NOT NULL DEFAULT 'clicked',
  converted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_referral_attribution (attribution_token),
  KEY ix_referral_affiliate_status (affiliate_user_id, status, created_at),
  CONSTRAINT fk_referral_link FOREIGN KEY (referral_link_id) REFERENCES referral_links(id) ON DELETE RESTRICT,
  CONSTRAINT fk_referral_affiliate FOREIGN KEY (affiliate_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_referral_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  referral_id BIGINT UNSIGNED NULL,
  external_order_ref VARCHAR(120) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  gross_amount DECIMAL(14,2) NOT NULL,
  eligible_amount DECIMAL(14,2) NOT NULL,
  status ENUM('pending','confirmed','refunded','cancelled') NOT NULL DEFAULT 'pending',
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_business_order (business_id, external_order_ref),
  KEY ix_sales_status_date (business_id, status, created_at),
  CONSTRAINT chk_sale_amounts CHECK (gross_amount >= 0 AND eligible_amount >= 0 AND eligible_amount <= gross_amount),
  CONSTRAINT fk_sale_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sale_referral FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE commissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id BIGINT UNSIGNED NOT NULL,
  affiliate_user_id BIGINT UNSIGNED NOT NULL,
  rule_id BIGINT UNSIGNED NULL,
  rate_percent DECIMAL(5,2) NOT NULL,
  basis_amount DECIMAL(14,2) NOT NULL,
  commission_amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('pending','approved','payable','paid','reversed','disputed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_commission_per_sale (sale_id),
  KEY ix_commission_affiliate_status (affiliate_user_id, status, created_at),
  CONSTRAINT chk_commission_values CHECK (rate_percent >= 0 AND rate_percent <= 100 AND basis_amount >= 0 AND commission_amount >= 0),
  CONSTRAINT fk_commission_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT,
  CONSTRAINT fk_commission_affiliate FOREIGN KEY (affiliate_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_commission_rule FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE financial_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  commission_id BIGINT UNSIGNED NULL,
  payout_id BIGINT UNSIGNED NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  type ENUM('commission_credit','payout_debit','refund_reversal','manual_adjustment') NOT NULL,
  direction ENUM('credit','debit') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status ENUM('pending','posted','failed','reversed') NOT NULL DEFAULT 'pending',
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transaction_idempotency (idempotency_key),
  KEY ix_transaction_business_date (business_id, status, created_at),
  KEY ix_transaction_user_date (user_id, created_at),
  CONSTRAINT chk_transaction_amount CHECK (amount > 0),
  CONSTRAINT fk_transaction_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transaction_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transaction_commission FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payouts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  affiliate_user_id BIGINT UNSIGNED NOT NULL,
  business_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  method VARCHAR(40) NOT NULL,
  destination_ref VARCHAR(190) NOT NULL,
  status ENUM('requested','approved','processing','paid','rejected','failed') NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  processed_by BIGINT UNSIGNED NULL,
  external_reference VARCHAR(120) NULL,
  PRIMARY KEY (id),
  KEY ix_payout_affiliate_status (affiliate_user_id, status, requested_at),
  CONSTRAINT chk_payout_amount CHECK (amount > 0),
  CONSTRAINT fk_payout_affiliate FOREIGN KEY (affiliate_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payout_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payout_processor FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE financial_transactions
  ADD CONSTRAINT fk_transaction_payout FOREIGN KEY (payout_id) REFERENCES payouts(id) ON DELETE RESTRICT;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  business_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message VARCHAR(500) NOT NULL,
  action_url VARCHAR(2048) NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notification_inbox (recipient_user_id, read_at, created_at),
  CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_notification_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  business_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  ip_address VARBINARY(16) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_business_date (business_id, created_at),
  KEY ix_audit_actor_date (actor_user_id, created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_audit_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
