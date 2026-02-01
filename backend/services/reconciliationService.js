const Record = require('../models/Record');
const ReconciliationResult = require('../models/ReconciliationResult');
const AuditLog = require('../models/AuditLog');

class ReconciliationService {
  constructor() {
    this.tolerance = parseFloat(process.env.RECONCILIATION_TOLERANCE) || 0.02;
    this.reconciliationRules = {
      exactMatchFields: ['transactionId', 'amount'],
      partialMatchFields: ['referenceNumber'],
      tolerance: this.tolerance
    };
  }

  // Calculate match score between two records
  calculateMatchScore(uploadedRecord, systemRecord) {
    let score = 0;
    let totalFields = 0;

    // Exact match fields
    this.reconciliationRules.exactMatchFields.forEach(field => {
      totalFields++;
      if (field === 'amount') {
        const diff = Math.abs(uploadedRecord[field] - systemRecord[field]);
        const avgAmount = (uploadedRecord[field] + systemRecord[field]) / 2;
        const variance = diff / avgAmount;
        
        if (variance <= this.tolerance) {
          score += 1;
        } else if (variance <= this.tolerance * 2) {
          score += 0.5;
        }
      } else if (uploadedRecord[field] === systemRecord[field]) {
        score += 1;
      }
    });

    // Partial match fields
    this.reconciliationRules.partialMatchFields.forEach(field => {
      totalFields++;
      if (uploadedRecord[field] === systemRecord[field]) {
        score += 0.8; // Partial match gets lower weight
      }
    });

    return totalFields > 0 ? score / totalFields : 0;
  }

  // Find differences between records
  findDifferences(uploadedRecord, systemRecord) {
    const differences = [];
    const fieldsToCompare = ['transactionId', 'amount', 'referenceNumber', 'date', 'description'];

    fieldsToCompare.forEach(field => {
      const uploadedValue = uploadedRecord[field];
      const systemValue = systemRecord[field];

      if (uploadedValue !== systemValue) {
        const diff = {
          field,
          uploadedValue,
          systemValue
        };

        // Calculate variance for numeric fields
        if (field === 'amount' && typeof uploadedValue === 'number' && typeof systemValue === 'number') {
          const variance = Math.abs(uploadedValue - systemValue) / Math.max(uploadedValue, systemValue);
          diff.variance = variance;
        }

        differences.push(diff);
      }
    });

    return differences;
  }

  // Determine match status based on score and differences
  determineMatchStatus(score, differences, duplicateCount) {
    if (duplicateCount > 1) {
      return 'duplicate';
    }
    
    if (score >= 0.95) {
      return 'matched';
    } else if (score >= 0.6) {
      return 'partially_matched';
    } else {
      return 'not_matched';
    }
  }

  // Find potential system matches for an uploaded record
  async findSystemMatches(uploadedRecord) {
    const matches = [];

    // Try exact match first (Transaction ID + Amount)
    const exactMatches = await Record.find({
      transactionId: uploadedRecord.transactionId,
      amount: uploadedRecord.amount,
      isSystemRecord: true
    });

    matches.push(...exactMatches);

    // If no exact match, try partial match (Reference Number with amount tolerance)
    if (matches.length === 0) {
      const amountMin = uploadedRecord.amount * (1 - this.tolerance);
      const amountMax = uploadedRecord.amount * (1 + this.tolerance);

      const partialMatches = await Record.find({
        referenceNumber: uploadedRecord.referenceNumber,
        amount: { $gte: amountMin, $lte: amountMax },
        isSystemRecord: true
      });

      matches.push(...partialMatches);
    }

    return matches;
  }

  // Check for duplicates in uploaded records
  async findDuplicates(uploadJobId) {
    const duplicates = await Record.aggregate([
      { $match: { uploadJobId, isSystemRecord: false } },
      {
        $group: {
          _id: '$transactionId',
          records: { $push: '$$ROOT' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    return duplicates;
  }

  // Reconcile records for an upload job
  async reconcileUploadJob(uploadJobId, userId) {
    try {
      // Get all uploaded records for this job
      const uploadedRecords = await Record.find({ 
        uploadJobId, 
        isSystemRecord: false 
      });

      if (uploadedRecords.length === 0) {
        throw new Error('No uploaded records found for reconciliation');
      }

      // Find duplicates first
      const duplicates = await this.findDuplicates(uploadJobId);
      const duplicateTransactionIds = new Set(duplicates.map(d => d._id));

      const reconciliationResults = [];

      // Process each uploaded record
      for (const uploadedRecord of uploadedRecords) {
        const duplicateCount = duplicateTransactionIds.has(uploadedRecord.transactionId) 
          ? duplicates.find(d => d._id === uploadedRecord.transactionId)?.count || 1
          : 1;

        // Find potential system matches
        const systemMatches = await this.findSystemMatches(uploadedRecord);
        
        let bestMatch = null;
        let bestScore = 0;

        // Find the best matching system record
        for (const systemRecord of systemMatches) {
          const score = this.calculateMatchScore(uploadedRecord, systemRecord);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = systemRecord;
          }
        }

        // Create reconciliation result
        const differences = bestMatch 
          ? this.findDifferences(uploadedRecord, bestMatch)
          : [];

        const matchStatus = this.determineMatchStatus(bestScore, differences, duplicateCount);

        const reconciliationResult = new ReconciliationResult({
          uploadedRecordId: uploadedRecord._id,
          systemRecordId: bestMatch?._id,
          matchStatus,
          matchScore: bestScore,
          differences,
          uploadJobId,
          reconciliationRules: this.reconciliationRules
        });

        await reconciliationResult.save();
        reconciliationResults.push(reconciliationResult);

        // Create audit log
        await AuditLog.create({
          entityType: 'reconciliation_result',
          entityId: reconciliationResult._id,
          action: 'reconcile',
          userId,
          newValue: {
            matchStatus,
            matchScore: bestScore,
            systemRecordId: bestMatch?._id
          },
          source: 'system'
        });
      }

      return {
        success: true,
        totalRecords: uploadedRecords.length,
        results: {
          matched: reconciliationResults.filter(r => r.matchStatus === 'matched').length,
          partiallyMatched: reconciliationResults.filter(r => r.matchStatus === 'partially_matched').length,
          notMatched: reconciliationResults.filter(r => r.matchStatus === 'not_matched').length,
          duplicates: reconciliationResults.filter(r => r.matchStatus === 'duplicate').length
        }
      };

    } catch (error) {
      console.error('Reconciliation error:', error);
      throw error;
    }
  }

  // Manual resolution of reconciliation result
  async resolveManually(reconciliationId, resolution, userId) {
    const reconciliationResult = await ReconciliationResult.findById(reconciliationId);
    if (!reconciliationResult) {
      throw new Error('Reconciliation result not found');
    }

    const oldValue = {
      matchStatus: reconciliationResult.matchStatus,
      isManuallyResolved: reconciliationResult.isManuallyResolved,
      notes: reconciliationResult.notes
    };

    // Update reconciliation result
    reconciliationResult.matchStatus = resolution.matchStatus;
    reconciliationResult.isManuallyResolved = true;
    reconciliationResult.resolvedBy = userId;
    reconciliationResult.resolvedAt = new Date();
    reconciliationResult.notes = resolution.notes;

    if (resolution.systemRecordId) {
      reconciliationResult.systemRecordId = resolution.systemRecordId;
    }

    await reconciliationResult.save();

    // Create audit log
    await AuditLog.create({
      entityType: 'reconciliation_result',
      entityId: reconciliationResult._id,
      action: 'resolve',
      userId,
      oldValue,
      newValue: {
        matchStatus: reconciliationResult.matchStatus,
        isManuallyResolved: true,
        notes: reconciliationResult.notes,
        systemRecordId: reconciliationResult.systemRecordId
      },
      source: 'web_ui'
    });

    return reconciliationResult;
  }

  // Get reconciliation statistics
  async getReconciliationStats(uploadJobId) {
    const stats = await ReconciliationResult.aggregate([
      { $match: { uploadJobId } },
      {
        $group: {
          _id: '$matchStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      matched: 0,
      partially_matched: 0,
      not_matched: 0,
      duplicate: 0,
      total: 0
    };

    stats.forEach(stat => {
      result[stat._id] = stat.count;
      result.total += stat.count;
    });

    result.accuracy = result.total > 0 
      ? ((result.matched + result.partially_matched) / result.total * 100).toFixed(2)
      : 0;

    return result;
  }
}

module.exports = new ReconciliationService();