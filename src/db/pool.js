/*
 * Single shared Postgres connection pool. Every service/route imports this
 * instead of opening its own connection.
 */

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;