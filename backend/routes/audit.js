const express = require('express');
const Joi = require('joi');
const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schemas
const auditFilterSchema = Joi.object({
  entityType: Joi.string().valid('record', 'reconciliation_result', 'upload_job', 'user'),
  entityId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  action: Joi.string().valid('create', 'update', 'delete', 'reconcile', 'resolve', 'upload'),
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  dateFrom: Joi.date(),
  dateTo: Joi.date(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

// Get audit logs with filters
router.get('/logs',
  authenticate,
  authorize('admin', 'analyst'), // Only admin and analyst can view audit logs
  async (req, res) => {
    try {
      const { error, value } = auditFilterSchema.validate(req.query);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { entityType, entityId, action, userId, dateFrom, dateTo, page, limit } = value;
      const skip = (page - 1) * limit;

      // Build query
      let query = {};
      
      if (entityType) query.entityType = entityType;
      if (entityId) query.entityId = entityId;
      if (action) query.action = action;
      if (userId) query.userId = userId;

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = dateFrom;
        if (dateTo) query.createdAt.$lte = dateTo;
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .populate('userId', 'username email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(query)
      ]);

      res.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Get audit logs error:', error);
      res.status(500).json({ message: 'Failed to get audit logs', error: error.message });
    }
  }
);

// Get audit timeline for a specific entity
router.get('/timeline/:entityType/:entityId',
  authenticate,
  async (req, res) => {
    try {
      const { entityType, entityId } = req.params;

      // Validate entity type
      const validEntityTypes = ['record', 'reconciliation_result', 'upload_job', 'user'];
      if (!validEntityTypes.includes(entityType)) {
        return res.status(400).json({ message: 'Invalid entity type' });
      }

      if (!mongoose.Types.ObjectId.isValid(entityId)) {
        return res.status(400).json({ message: 'Invalid entity ID' });
      }

      // Role-based access control
      if (req.user.role === 'viewer') {
        // Viewers can only see audit logs for their own uploads
        if (entityType === 'upload_job') {
          const UploadJob = require('../models/UploadJob');
          const uploadJob = await UploadJob.findById(entityId);
          if (!uploadJob || uploadJob.uploadedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Access denied' });
          }
        } else {
          return res.status(403).json({ message: 'Access denied' });
        }
      }

      const timeline = await AuditLog.find({
        entityType,
        entityId
      })
        .populate('userId', 'username email')
        .sort({ createdAt: 1 }) // Chronological order for timeline
        .lean();

      // Format timeline for frontend
      const formattedTimeline = timeline.map(log => ({
        id: log._id,
        timestamp: log.createdAt,
        action: log.action,
        user: log.userId,
        changes: log.changes || [],
        oldValue: log.oldValue,
        newValue: log.newValue,
        source: log.source,
        metadata: log.metadata
      }));

      res.json({
        entityType,
        entityId,
        timeline: formattedTimeline
      });

    } catch (error) {
      console.error('Get audit timeline error:', error);
      res.status(500).json({ message: 'Failed to get audit timeline', error: error.message });
    }
  }
);

// Get audit statistics
router.get('/stats',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;

      let matchQuery = {};
      if (dateFrom || dateTo) {
        matchQuery.createdAt = {};
        if (dateFrom) matchQuery.createdAt.$gte = new Date(dateFrom);
        if (dateTo) matchQuery.createdAt.$lte = new Date(dateTo);
      }

      const stats = await AuditLog.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              action: '$action',
              entityType: '$entityType'
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.action',
            entityTypes: {
              $push: {
                entityType: '$_id.entityType',
                count: '$count'
              }
            },
            totalCount: { $sum: '$count' }
          }
        }
      ]);

      // Get user activity stats
      const userActivity = await AuditLog.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$userId',
            actionCount: { $sum: 1 },
            actions: { $addToSet: '$action' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        },
        {
          $project: {
            username: '$user.username',
            email: '$user.email',
            actionCount: 1,
            actions: 1
          }
        },
        { $sort: { actionCount: -1 } },
        { $limit: 10 }
      ]);

      // Get daily activity
      const dailyActivity = await AuditLog.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      res.json({
        actionStats: stats,
        userActivity,
        dailyActivity,
        totalLogs: await AuditLog.countDocuments(matchQuery)
      });

    } catch (error) {
      console.error('Get audit stats error:', error);
      res.status(500).json({ message: 'Failed to get audit statistics', error: error.message });
    }
  }
);

// Export audit logs (CSV format)
router.get('/export',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const { dateFrom, dateTo, entityType, action } = req.query;

      let query = {};
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }
      if (entityType) query.entityType = entityType;
      if (action) query.action = action;

      const logs = await AuditLog.find(query)
        .populate('userId', 'username email')
        .sort({ createdAt: -1 })
        .lean();

      // Convert to CSV format
      const csvHeaders = [
        'Timestamp',
        'Entity Type',
        'Entity ID',
        'Action',
        'User',
        'User Email',
        'Source',
        'IP Address',
        'Changes'
      ];

      const csvRows = logs.map(log => [
        log.createdAt.toISOString(),
        log.entityType,
        log.entityId,
        log.action,
        log.userId?.username || 'Unknown',
        log.userId?.email || 'Unknown',
        log.source,
        log.ipAddress || '',
        JSON.stringify(log.changes || [])
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);

    } catch (error) {
      console.error('Export audit logs error:', error);
      res.status(500).json({ message: 'Failed to export audit logs', error: error.message });
    }
  }
);

module.exports = router;