-- Reserve payable commissions while a withdrawal is under review.
ALTER TABLE commissions
  MODIFY COLUMN status ENUM('pending','approved','payable','reserved','paid','reversed','disputed')
  NOT NULL DEFAULT 'pending';
