const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const ReconciliationResult = require('../models/ReconciliationResult');
const Record = require('../models/Record');
const UploadJob = require('../models/UploadJob');
const reconciliationService = require('../services/reconciliationService');
const { authenticate, authorize, auditMiddleware } = require('../middleware/auth');

const router = express.Router();

const manualResolutionSchema = Joi.object({
  matchStatus: Joi.string().valid('matched', 'partially_matched', 'not_matched').required(),
  systemRecordId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  notes: Joi.string().max(500).allow('')
});

const filterSchema = Joi.object({
  uploadJobId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  matchStatus: Joi.string().valid('matched', 'partially_matched', 'not_matched', 'duplicate'),
  dateFrom: Joi.date(),
  dateTo: Joi.date(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

router.get('/results',
  authenticate,
  async (req, res) => {
    try {
      const { error, value } = filterSchema.validate(req.query);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { uploadJobId, matchStatus, dateFrom, dateTo, page, limit } = value;
      const skip = (page - 1) * limit;

      let query = {};
      
      if (uploadJobId) {
        query.uploadJobId = uploadJobId;
      }

      if (matchStatus) {
        query.matchStatus = matchStatus;
      }

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = dateFrom;
        if (dateTo) query.createdAt.$lte = dateTo;
      }

      if (req.user.role === 'viewer') {
        const userUploadJobs = await UploadJob.find({ uploadedBy: req.user._id }).select('_id');
        const jobIds = userUploadJobs.map(job => job._id);
        query.uploadJobId = { $in: jobIds };
      }

      const [results, total] = await Promise.all([
        ReconciliationResult.find(query)
          .populate({
            path: 'uploadedRecordId',
            select: 'transactionId amount referenceNumber date description rowNumber'
          })
          .populate({
            path: 'systemRecordId',
            select: 'transactionId amount referenceNumber date description'
          })
          .populate({
            path: 'uploadJobId',
            select: 'originalName uploadedBy createdAt',
            populate: {
              path: 'uploadedBy',
              select: 'username'
            }
          })
          .populate('resolvedBy', 'username')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ReconciliationResult.countDocuments(query)
      ]);

      res.json({
        results,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get reconciliation results error:', error);
      res.status(500).json({ message: 'Failed to get reconciliation results', error: error.message });
    }
  }
);

router.get('/results/:id',
  authenticate,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid reconciliation result ID' });
      }

      const result = await ReconciliationResult.findById(id)
        .populate({
          path: 'uploadedRecordId',
          select: 'transactionId amount referenceNumber date description category rowNumber originalData'
        })
        .populate({
          path: 'systemRecordId',
          select: 'transactionId amount referenceNumber date description category'
        })
        .populate({
          path: 'uploadJobId',
          select: 'originalName uploadedBy createdAt',
          populate: {
            path: 'uploadedBy',
            select: 'username email'
          }
        })
        .populate('resolvedBy', 'username email')
        .lean();

      if (!result) {
        return res.status(404).json({ message: 'Reconciliation result not found' });
      }

      if (req.user.role === 'viewer' && 
          result.uploadJobId.uploadedBy._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      res.json(result);

    } catch (error) {
      console.error('Get reconciliation result error:', error);
      res.status(500).json({ message: 'Failed to get reconciliation result', error: error.message });
    }
  }
);

router.put('/results/:id/resolve',
  authenticate,
  authorize('admin', 'analyst'),
  auditMiddleware('resolve', 'reconciliation_result'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { error, value } = manualResolutionSchema.validate(req.body);

      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid reconciliation result ID' });
      }

      if (value.systemRecordId) {
        const systemRecord = await Record.findOne({
          _id: value.systemRecordId,
          isSystemRecord: true
        });

        if (!systemRecord) {
          return res.status(400).json({ message: 'Invalid system record ID' });
        }
      }

      const resolvedResult = await reconciliationService.resolveManually(
        id,
        value,
        req.user._id
      );

      res.json({
        message: 'Reconciliation result resolved successfully',
        result: resolvedResult
      });

    } catch (error) {
      console.error('Manual resolution error:', error);
      if (error.message === 'Reconciliation result not found') {
        return res.status(404).json({ message: error.message });
      }
      res.status(500).json({ message: 'Failed to resolve reconciliation result', error: error.message });
    }
  }
);

router.get('/stats/:uploadJobId',
  authenticate,
  async (req, res) => {
    try {
      const { uploadJobId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(uploadJobId)) {
        return res.status(400).json({ message: 'Invalid upload job ID' });
      }

      const uploadJob = await UploadJob.findById(uploadJobId);
      if (!uploadJob) {
        return res.status(404).json({ message: 'Upload job not found' });
      }

      if (req.user.role === 'viewer' && 
          uploadJob.uploadedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const stats = await reconciliationService.getReconciliationStats(uploadJobId);

      res.json(stats);

    } catch (error) {
      console.error('Get reconciliation stats error:', error);
      res.status(500).json({ message: 'Failed to get reconciliation statistics', error: error.message });
    }
  }
);

router.get('/matches/:recordId',
  authenticate,
  authorize('admin', 'analyst'),
  async (req, res) => {
    try {
      const { recordId } = req.params;
      const { search } = req.query;

      if (!mongoose.Types.ObjectId.isValid(recordId)) {
        return res.status(400).json({ message: 'Invalid record ID' });
      }

      const uploadedRecord = await Record.findById(recordId);
      if (!uploadedRecord || uploadedRecord.isSystemRecord) {
        return res.status(404).json({ message: 'Uploaded record not found' });
      }

      let matches = [];

      if (search) {
        matches = await Record.find({
          isSystemRecord: true,
          $or: [
            { transactionId: { $regex: search, $options: 'i' } },
            { referenceNumber: { $regex: search, $options: 'i' } }
          ]
        }).limit(10);
      } else {
        matches = await reconciliationService.findSystemMatches(uploadedRecord);
      }

      const matchesWithScores = matches.map(systemRecord => ({
        ...systemRecord.toObject(),
        matchScore: reconciliationService.calculateMatchScore(uploadedRecord, systemRecord),
        differences: reconciliationService.findDifferences(uploadedRecord, systemRecord)
      }));

      matchesWithScores.sort((a, b) => b.matchScore - a.matchScore);

      res.json({
        uploadedRecord,
        potentialMatches: matchesWithScores.slice(0, 10)
      });

    } catch (error) {
      console.error('Get potential matches error:', error);
      res.status(500).json({ message: 'Failed to get potential matches', error: error.message });
    }
  }
);

router.post('/trigger/:uploadJobId',
  authenticate,
  authorize('admin', 'analyst'),
  auditMiddleware('reconcile', 'upload_job'),
  async (req, res) => {
    try {
      const { uploadJobId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(uploadJobId)) {
        return res.status(400).json({ message: 'Invalid upload job ID' });
      }

      const uploadJob = await UploadJob.findById(uploadJobId);
      if (!uploadJob) {
        return res.status(404).json({ message: 'Upload job not found' });
      }

      if (req.user.role === 'viewer' && 
          uploadJob.uploadedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (uploadJob.status !== 'completed') {
        return res.status(400).json({ message: 'Upload job must be completed before reconciliation' });
      }

      const result = await reconciliationService.reconcileUploadJob(uploadJobId, req.user._id);

      res.json({
        message: 'Reconciliation triggered successfully',
        result
      });

    } catch (error) {
      console.error('Manual reconciliation trigger error:', error);
      res.status(500).json({ message: 'Failed to trigger reconciliation', error: error.message });
    }
  }
);

module.exports = router;