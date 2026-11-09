# Suggested MongoDB collections

These are proposed collection designs based on the Frontend features. They are not implemented or connected yet.

- `users`: name, email/username, passwordHash, role, isActive, createdAt
- `products`: name, sku, barcode, categoryId, purchasePrice, salePrice, stockQty, isActive
- `categories`: name, description
- `customers`: name, phone, address
- `suppliers`: name, phone, address
- `sales`: invoiceNo, customerId, items[], subtotal, discount, total, paid, balance, createdBy, createdAt
- `purchases`: supplierId, items[], total, paid, balance, createdBy, createdAt
- `debts`: partyType, partyId, saleId, amount, paidAmount, status, dueDate
- `expenses`: title, amount, category, createdBy, createdAt
- `settings`: key, value

Use MongoDB references/ObjectIds for related records, schema validation, indexes for SKU/barcode/invoiceNo, and transactions where multi-document updates must be atomic.
