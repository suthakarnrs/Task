const mongoose = require('mongoose');

const reconciliationResultSchema = new mongoose.Schema({
  uploadedRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Record',
    required: true
  },
  systemRecordId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Record'
  },
  matchStatus: {
    type: String,
    enum: ['matched', 'partially_matched', 'not_matched', 'duplicate'],
    required: true
  },
  matchScore: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  differences: [{
    field: String,
    uploadedValue: mongoose.Schema.Types.Mixed,
    systemValue: mongoose.Schema.Types.Mixed,
    variance: Number
  }],
  uploadJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UploadJob',
    required: true
  },
  reconciliationRules: {
    exactMatchFields: [String],
    partialMatchFields: [String],
    tolerance: Number
  },
  isManuallyResolved: {
    type: Boolean,
    default: false
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date,
  notes: String
}, {
  timestamps: true
});

// Indexes for performance
reconciliationResultSchema.index({ uploadedRecordId: 1 });
reconciliationResultSchema.index({ systemRecordId: 1 });
reconciliationResultSchema.index({ uploadJobId: 1 });
reconciliationResultSchema.index({ matchStatus: 1 });
reconciliationResultSchema.index({ isManuallyResolved: 1 });

module.exports = mongoose.model('ReconciliationResult', reconciliationResultSchema);