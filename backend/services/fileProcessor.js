const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const crypto = require('crypto');
const path = require('path');
const UploadJob = require('../models/UploadJob');
const Record = require('../models/Record');
const AuditLog = require('../models/AuditLog');

class FileProcessor {
  constructor() {
    this.maxRecords = parseInt(process.env.MAX_RECORDS) || 50000;
  }

  generateFileHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  async checkDuplicateFile(fileHash) {
    return await UploadJob.findOne({ 
      fileHash, 
      status: { $in: ['completed', 'processing'] } 
    });
  }

  async parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      let rowCount = 0;
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          rowCount++;
          if (rowCount > this.maxRecords) {
            return reject(new Error(`File exceeds maximum allowed records (${this.maxRecords})`));
          }
          results.push({ ...data, rowNumber: rowCount });
        })
        .on('end', () => {
          resolve(results);
        })
        .on('error', reject);
    });
  }

  async parseExcel(filePath) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: ''
      });

      if (jsonData.length > this.maxRecords + 1) { // +1 for header
        throw new Error(`File exceeds maximum allowed records (${this.maxRecords})`);
      }

      const headers = jsonData[0];
      const results = jsonData.slice(1).map((row, index) => {
        const obj = { rowNumber: index + 1 };
        headers.forEach((header, i) => {
          obj[header] = row[i] || '';
        });
        return obj;
      });

      return results;
    } catch (error) {
      throw new Error(`Excel parsing error: ${error.message}`);
    }
  }

  validateRecord(record, columnMapping, rowNumber) {
    const errors = [];
    const requiredFields = ['transactionId', 'amount', 'referenceNumber', 'date'];
    
    requiredFields.forEach(field => {
      const mappedField = columnMapping[field];
      if (!mappedField || !record[mappedField]) {
        errors.push({
          row: rowNumber,
          field: field,
          message: `Required field '${field}' is missing or empty`
        });
      }
    });

    if (columnMapping.amount && record[columnMapping.amount]) {
      const amount = parseFloat(record[columnMapping.amount]);
      if (isNaN(amount)) {
        errors.push({
          row: rowNumber,
          field: 'amount',
          message: 'Amount must be a valid number'
        });
      }
    }

    if (columnMapping.date && record[columnMapping.date]) {
      const date = new Date(record[columnMapping.date]);
      if (isNaN(date.getTime())) {
        errors.push({
          row: rowNumber,
          field: 'date',
          message: 'Date must be in a valid format'
        });
      }
    }

    return errors;
  }

  transformRecord(record, columnMapping) {
    return {
      transactionId: record[columnMapping.transactionId]?.toString().trim(),
      amount: parseFloat(record[columnMapping.amount]),
      referenceNumber: record[columnMapping.referenceNumber]?.toString().trim(),
      date: new Date(record[columnMapping.date]),
      description: record[columnMapping.description]?.toString().trim() || '',
      category: record[columnMapping.category]?.toString().trim() || '',
      originalData: record
    };
  }

  async processFile(jobId) {
    const uploadJob = await UploadJob.findOne({ jobId });
    if (!uploadJob) {
      throw new Error('Upload job not found');
    }

    try {
      uploadJob.status = 'processing';
      uploadJob.processingStarted = new Date();
      await uploadJob.save();

      const filePath = path.join(__dirname, '../uploads', uploadJob.filename);
      
      if (!fs.existsSync(filePath)) {
        throw new Error('Uploaded file not found');
      }

      let rawData;
      const fileExt = path.extname(uploadJob.originalName).toLowerCase();
      
      if (fileExt === '.csv') {
        rawData = await this.parseCSV(filePath);
      } else if (['.xlsx', '.xls'].includes(fileExt)) {
        rawData = await this.parseExcel(filePath);
      } else {
        throw new Error('Unsupported file format');
      }

      uploadJob.totalRecords = rawData.length;
      await uploadJob.save();

      const errors = [];
      const validRecords = [];

      // Process each record
      for (const rawRecord of rawData) {
        const recordErrors = this.validateRecord(
          rawRecord, 
          uploadJob.columnMapping, 
          rawRecord.rowNumber
        );

        if (recordErrors.length > 0) {
          errors.push(...recordErrors);
          continue;
        }

        try {
          const transformedRecord = this.transformRecord(rawRecord, uploadJob.columnMapping);
          transformedRecord.uploadJobId = uploadJob._id;
          transformedRecord.rowNumber = rawRecord.rowNumber;
          
          validRecords.push(transformedRecord);
        } catch (error) {
          errors.push({
            row: rawRecord.rowNumber,
            field: 'general',
            message: `Record transformation error: ${error.message}`
          });
        }
      }

      if (validRecords.length > 0) {
        try {
          await Record.insertMany(validRecords, { ordered: false });
          uploadJob.processedRecords = validRecords.length;
        } catch (error) {
          if (error.code === 11000) {
            const duplicateErrors = error.writeErrors || [];
            duplicateErrors.forEach(err => {
              errors.push({
                row: err.err.op.rowNumber,
                field: 'transactionId',
                message: 'Duplicate transaction ID in upload'
              });
            });
            uploadJob.processedRecords = validRecords.length - duplicateErrors.length;
          } else {
            throw error;
          }
        }
      }

      uploadJob.errors = errors;
      uploadJob.errorRecords = errors.length;
      uploadJob.status = 'completed';
      uploadJob.processingCompleted = new Date();
      await uploadJob.save();

      await AuditLog.create({
        entityType: 'upload_job',
        entityId: uploadJob._id,
        action: 'upload',
        userId: uploadJob.uploadedBy,
        newValue: {
          totalRecords: uploadJob.totalRecords,
          processedRecords: uploadJob.processedRecords,
          errorRecords: uploadJob.errorRecords
        },
        source: 'system'
      });

      fs.unlinkSync(filePath);

      return {
        success: true,
        totalRecords: uploadJob.totalRecords,
        processedRecords: uploadJob.processedRecords,
        errorRecords: uploadJob.errorRecords
      };

    } catch (error) {
      uploadJob.status = 'failed';
      uploadJob.errors = [{ 
        row: 0, 
        field: 'general', 
        message: error.message 
      }];
      await uploadJob.save();
      
      throw error;
    }
  }
}

module.exports = new FileProcessor();