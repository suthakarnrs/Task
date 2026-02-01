#!/usr/bin/env node

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const User = require('../models/User');
const Record = require('../models/Record');

async function seedData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create admin user
    const adminExists = await User.findOne({ email: 'admin@example.com' });
    if (!adminExists) {
      const admin = new User({
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin'
      });
      await admin.save();
      console.log('Admin user created');
    }

    // Create analyst user
    const analystExists = await User.findOne({ email: 'analyst@example.com' });
    if (!analystExists) {
      const analyst = new User({
        username: 'analyst',
        email: 'analyst@example.com',
        password: 'analyst123',
        role: 'analyst'
      });
      await analyst.save();
      console.log('Analyst user created');
    }

    // Create viewer user
    const viewerExists = await User.findOne({ email: 'viewer@example.com' });
    if (!viewerExists) {
      const viewer = new User({
        username: 'viewer',
        email: 'viewer@example.com',
        password: 'viewer123',
        role: 'viewer'
      });
      await viewer.save();
      console.log('Viewer user created');
    }

    // Load system records from CSV
    const systemRecordsPath = path.join(__dirname, '../../sample-data/system-records.csv');
    if (fs.existsSync(systemRecordsPath)) {
      const systemRecordsCount = await Record.countDocuments({ isSystemRecord: true });
      
      if (systemRecordsCount === 0) {
        const systemRecords = [];
        
        await new Promise((resolve, reject) => {
          fs.createReadStream(systemRecordsPath)
            .pipe(csv())
            .on('data', (data) => {
              systemRecords.push({
                transactionId: data['Transaction ID'],
                amount: parseFloat(data['Amount']),
                referenceNumber: data['Reference Number'],
                date: new Date(data['Date']),
                description: data['Description'],
                category: data['Category'],
                isSystemRecord: true,
                uploadJobId: new mongoose.Types.ObjectId(), // Dummy upload job ID
                rowNumber: systemRecords.length + 1
              });
            })
            .on('end', resolve)
            .on('error', reject);
        });

        await Record.insertMany(systemRecords);
        console.log(`${systemRecords.length} system records created`);
      }
    }

    console.log('Seed data completed successfully');
    
  } catch (error) {
    console.error('Seed data error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seedData();