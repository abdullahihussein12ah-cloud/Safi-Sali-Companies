# Database — MongoDB

Database name: `maqsuud_pos`

The Backend connects using `MONGODB_URI` in `Backend/.env`. MongoDB creates the database and collections when documents are first written. Suggested collections for the POS system are documented in `schemas/collections.md`.

## Local URI
`mongodb://127.0.0.1:27017/maqsuud_pos`

For production, use MongoDB Atlas or a secured MongoDB server, credentials stored in environment variables, and regular backups.
