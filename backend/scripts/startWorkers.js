#!/usr/bin/env node

// Start job processors
require('dotenv').config();
require('../workers/jobProcessor');

console.log('Job workers started successfully');

// Keep the process running
process.on('SIGINT', () => {
  console.log('Shutting down workers...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down workers...');
  process.exit(0);
});