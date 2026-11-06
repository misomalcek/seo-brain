import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// This file must be imported FIRST before any other imports
// to ensure environment variables are loaded
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Desktop: a per-install JWT secret, kept in the app's data folder. Without it
// the build fell back to the dev default that is public in this repository.
if (process.env.SEO_BRAIN_DESKTOP === '1' && !process.env.JWT_SECRET && process.env.SEO_BRAIN_HOME) {
  const secretPath = path.join(process.env.SEO_BRAIN_HOME, 'jwt-secret');
  if (!fs.existsSync(secretPath)) {
    fs.mkdirSync(process.env.SEO_BRAIN_HOME, { recursive: true });
    fs.writeFileSync(secretPath, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  }
  process.env.JWT_SECRET = fs.readFileSync(secretPath, 'utf8').trim();
}

console.log('Environment loaded, API Key present:', !!process.env.ANTHROPIC_API_KEY);
