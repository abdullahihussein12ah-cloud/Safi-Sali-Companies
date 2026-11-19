-- Reserve payable commissions while a withdrawal is under review.
ALTER TABLE commissions
  MODIFY COLUMN status ENUM('pending','approved','payable','reserved','paid','reversed','disputed')
  NOT NULL DEFAULT 'pending';
CREATE TABLE IF NOT EXISTS payout_commissions (
  payout_id BIGINT UNSIGNED NOT NULL,
  commission_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (payout_id, commission_id),
  UNIQUE KEY uq_payout_commission (commission_id),
  CONSTRAINT fk_pc_payout FOREIGN KEY (payout_id) REFERENCES payouts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pc_commission FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE RESTRICT,
  CONSTRAINT chk_pc_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
