const express = require('express');
const Joi = require('joi');
const UploadJob = require('../models/UploadJob');
const ReconciliationResult = require('../models/ReconciliationResult');
const Record = require('../models/Record');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Validation schema for dashboard filters
const dashboardFilterSchema = Joi.object({
  dateFrom: Joi.date(),
  dateTo: Joi.date(),
  uploadedBy: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  status: Joi.string().valid('matched', 'partially_matched', 'not_matched', 'duplicate')
});

// Get dashboard summary
router.get('/summary',
  authenticate,
  async (req, res) => {
    try {
      const { error, value } = dashboardFilterSchema.validate(req.query);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { dateFrom, dateTo, uploadedBy, status } = value;

      // Build base query for role-based access
      let baseQuery = {};
      if (req.user.role === 'viewer') {
        baseQuery.uploadedBy = req.user._id;
      } else if (uploadedBy) {
        baseQuery.uploadedBy = uploadedBy;
      }

      // Date filter
      if (dateFrom || dateTo) {
        baseQuery.createdAt = {};
        if (dateFrom) baseQuery.createdAt.$gte = dateFrom;
        if (dateTo) baseQuery.createdAt.$lte = dateTo;
      }

      // Get upload job statistics
      const uploadStats = await UploadJob.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalRecords: { $sum: '$totalRecords' },
            processedRecords: { $sum: '$processedRecords' },
            errorRecords: { $sum: '$errorRecords' }
          }
        }
      ]);

      // Get reconciliation statistics
      let reconciliationQuery = {};
      if (req.user.role === 'viewer') {
        const userUploadJobs = await UploadJob.find({ uploadedBy: req.user._id }).select('_id');
        reconciliationQuery.uploadJobId = { $in: userUploadJobs.map(job => job._id) };
      } else if (uploadedBy) {
        const userUploadJobs = await UploadJob.find({ uploadedBy }).select('_id');
        reconciliationQuery.uploadJobId = { $in: userUploadJobs.map(job => job._id) };
      }

      if (status) {
        reconciliationQuery.matchStatus = status;
      }

      if (dateFrom || dateTo) {
        reconciliationQuery.createdAt = {};
        if (dateFrom) reconciliationQuery.createdAt.$gte = dateFrom;
        if (dateTo) reconciliationQuery.createdAt.$lte = dateTo;
      }

      const reconciliationStats = await ReconciliationResult.aggregate([
        { $match: reconciliationQuery },
        {
          $group: {
            _id: '$matchStatus',
            count: { $sum: 1 }
          }
        }
      ]);

      // Format upload statistics
      const uploadSummary = {
        processing: 0,
        completed: 0,
        failed: 0,
        totalUploads: 0,
        totalRecords: 0,
        processedRecords: 0,
        errorRecords: 0
      };

      uploadStats.forEach(stat => {
        uploadSummary[stat._id] = stat.count;
        uploadSummary.totalUploads += stat.count;
        uploadSummary.totalRecords += stat.totalRecords;
        uploadSummary.processedRecords += stat.processedRecords;
        uploadSummary.errorRecords += stat.errorRecords;
      });

      // Format reconciliation statistics
      const reconciliationSummary = {
        matched: 0,
        partially_matched: 0,
        not_matched: 0,
        duplicate: 0,
        total: 0
      };

      reconciliationStats.forEach(stat => {
        reconciliationSummary[stat._id] = stat.count;
        reconciliationSummary.total += stat.count;
      });

      // Calculate accuracy percentage
      const accuracy = reconciliationSummary.total > 0 
        ? ((reconciliationSummary.matched + reconciliationSummary.partially_matched) / reconciliationSummary.total * 100).toFixed(2)
        : 0;

      res.json({
        uploads: uploadSummary,
        reconciliation: {
          ...reconciliationSummary,
          accuracy: parseFloat(accuracy)
        },
        filters: {
          dateFrom,
          dateTo,
          uploadedBy,
          status
        }
      });

    } catch (error) {
      console.error('Dashboard summary error:', error);
      res.status(500).json({ message: 'Failed to get dashboard summary', error: error.message });
    }
  }
);

// Get reconciliation trends (for charts)
router.get('/trends',
  authenticate,
  async (req, res) => {
    try {
      const { error, value } = dashboardFilterSchema.validate(req.query);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { dateFrom, dateTo, uploadedBy } = value;

      // Default to last 30 days if no date range provided
      const endDate = dateTo || new Date();
      const startDate = dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Build query for role-based access
      let uploadJobQuery = {};
      if (req.user.role === 'viewer') {
        uploadJobQuery.uploadedBy = req.user._id;
      } else if (uploadedBy) {
        uploadJobQuery.uploadedBy = uploadedBy;
      }

      uploadJobQuery.createdAt = { $gte: startDate, $lte: endDate };

      // Get upload jobs in date range
      const uploadJobs = await UploadJob.find(uploadJobQuery).select('_id');
      const uploadJobIds = uploadJobs.map(job => job._id);

      // Get daily reconciliation trends
      const dailyTrends = await ReconciliationResult.aggregate([
        {
          $match: {
            uploadJobId: { $in: uploadJobIds },
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt'
                }
              },
              status: '$matchStatus'
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.date',
            statuses: {
              $push: {
                status: '$_id.status',
                count: '$count'
              }
            },
            total: { $sum: '$count' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Get accuracy trends
      const accuracyTrends = dailyTrends.map(day => {
        const statusCounts = {
          matched: 0,
          partially_matched: 0,
          not_matched: 0,
          duplicate: 0
        };

        day.statuses.forEach(status => {
          statusCounts[status.status] = status.count;
        });

        const accuracy = day.total > 0 
          ? ((statusCounts.matched + statusCounts.partially_matched) / day.total * 100).toFixed(2)
          : 0;

        return {
          date: day._id,
          ...statusCounts,
          total: day.total,
          accuracy: parseFloat(accuracy)
        };
      });

      // Get upload volume trends
      const uploadTrends = await UploadJob.aggregate([
        { $match: uploadJobQuery },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            uploads: { $sum: 1 },
            totalRecords: { $sum: '$totalRecords' },
            processedRecords: { $sum: '$processedRecords' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      res.json({
        reconciliationTrends: accuracyTrends,
        uploadTrends,
        dateRange: {
          from: startDate,
          to: endDate
        }
      });

    } catch (error) {
      console.error('Dashboard trends error:', error);
      res.status(500).json({ message: 'Failed to get dashboard trends', error: error.message });
    }
  }
);

// Get recent activity
router.get('/activity',
  authenticate,
  async (req, res) => {
    try {
      const { limit = 10 } = req.query;

      // Build query for role-based access
      let uploadJobQuery = {};
      if (req.user.role === 'viewer') {
        uploadJobQuery.uploadedBy = req.user._id;
      }

      // Get recent upload jobs
      const recentUploads = await UploadJob.find(uploadJobQuery)
        .populate('uploadedBy', 'username')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('jobId originalName status totalRecords processedRecords createdAt uploadedBy')
        .lean();

      // Get recent reconciliation activities
      let reconciliationQuery = {};
      if (req.user.role === 'viewer') {
        const userUploadJobs = await UploadJob.find({ uploadedBy: req.user._id }).select('_id');
        reconciliationQuery.uploadJobId = { $in: userUploadJobs.map(job => job._id) };
      }

      const recentReconciliations = await ReconciliationResult.find({
        ...reconciliationQuery,
        isManuallyResolved: true
      })
        .populate('resolvedBy', 'username')
        .populate({
          path: 'uploadJobId',
          select: 'originalName',
          populate: {
            path: 'uploadedBy',
            select: 'username'
          }
        })
        .sort({ resolvedAt: -1 })
        .limit(parseInt(limit))
        .select('matchStatus resolvedAt resolvedBy uploadJobId')
        .lean();

      res.json({
        recentUploads,
        recentReconciliations
      });

    } catch (error) {
      console.error('Dashboard activity error:', error);
      res.status(500).json({ message: 'Failed to get recent activity', error: error.message });
    }
  }
);

// Get system health metrics
router.get('/health',
  authenticate,
  async (req, res) => {
    try {
      // Get queue statistics (if available)
      let queueStats = null;
      try {
        const { getQueueStats } = require('../services/queueService');
        const [fileProcessingStats, reconciliationStats] = await Promise.all([
          getQueueStats('file-processing'),
          getQueueStats('reconciliation')
        ]);
        
        queueStats = {
          fileProcessing: fileProcessingStats,
          reconciliation: reconciliationStats
        };
      } catch (error) {
        console.warn('Queue stats unavailable:', error.message);
      }

      // Get database statistics
      const dbStats = {
        totalUploads: await UploadJob.countDocuments(),
        totalRecords: await Record.countDocuments(),
        totalReconciliations: await ReconciliationResult.countDocuments(),
        processingJobs: await UploadJob.countDocuments({ status: 'processing' })
      };

      // Get recent error rates
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const errorStats = await UploadJob.aggregate([
        {
          $match: {
            createdAt: { $gte: last24Hours }
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const errorRate = errorStats.reduce((acc, stat) => {
        if (stat._id === 'failed') acc.failed = stat.count;
        acc.total += stat.count;
        return acc;
      }, { failed: 0, total: 0 });

      res.json({
        database: dbStats,
        queues: queueStats,
        errorRate: {
          failed: errorRate.failed,
          total: errorRate.total,
          percentage: errorRate.total > 0 ? (errorRate.failed / errorRate.total * 100).toFixed(2) : 0
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Dashboard health error:', error);
      res.status(500).json({ message: 'Failed to get system health metrics', error: error.message });
    }
  }
);

module.exports = router;