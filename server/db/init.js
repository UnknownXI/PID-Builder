/**
 * Database initialization script
 * Run with: node db/init.js
 *
 * This will create all tables and seed predefined labels.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function initDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();

    // Read and execute schema
    console.log('Creating tables...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await client.query(schema);
    console.log('Tables created successfully.');

    // Read and execute seed data
    console.log('Seeding predefined labels...');
    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
    await client.query(seed);
    console.log('Seed data inserted.');

    client.release();
    console.log('Database initialization complete!');
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
