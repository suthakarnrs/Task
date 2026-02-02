const mongoose = require('mongoose');

const uploadJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  totalRecords: {
    type: Number,
    default: 0
  },
  processedRecords: {
    type: Number,
    default: 0
  },
  errorRecords: {
    type: Number,
    default: 0
  },
  columnMapping: {
    transactionId: String,
    amount: String,
    referenceNumber: String,
    date: String,
    description: String,
    category: String
  },
  errors: [{
    row: Number,
    field: String,
    message: String
  }],
  fileHash: {
    type: String,
    required: true
  },
  processingStarted: Date,
  processingCompleted: Date
}, {
  timestamps: true
});

uploadJobSchema.index({ jobId: 1 });
uploadJobSchema.index({ uploadedBy: 1 });
uploadJobSchema.index({ status: 1 });
uploadJobSchema.index({ fileHash: 1 });
uploadJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('UploadJob', uploadJobSchema);