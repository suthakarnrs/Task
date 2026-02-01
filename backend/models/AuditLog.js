const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  entityType: {
    type: String,
    required: true,
    enum: ['record', 'reconciliation_result', 'upload_job', 'user']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['create', 'update', 'delete', 'reconcile', 'resolve', 'upload']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  changes: [{
    field: String,
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed
  }],
  source: {
    type: String,
    enum: ['web_ui', 'api', 'system', 'bulk_upload'],
    default: 'web_ui'
  },
  ipAddress: String,
  userAgent: String,
  sessionId: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: { 
    createdAt: true, 
    updatedAt: false // Audit logs are immutable
  }
});

// Indexes for performance and querying
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, createdAt: -1 });

// Prevent updates to audit logs (immutable)
auditLogSchema.pre('updateOne', function() {
  throw new Error('Audit logs are immutable and cannot be updated');
});

auditLogSchema.pre('findOneAndUpdate', function() {
  throw new Error('Audit logs are immutable and cannot be updated');
});

auditLogSchema.pre('updateMany', function() {
  throw new Error('Audit logs are immutable and cannot be updated');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);