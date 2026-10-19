import dotenv from 'dotenv';
import path from 'path';

// This file must be imported FIRST before any other imports
// to ensure environment variables are loaded
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('Environment loaded, API Key present:', !!process.env.ANTHROPIC_API_KEY);
