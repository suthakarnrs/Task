const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true
  },
  referenceNumber: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  uploadJobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UploadJob',
    required: true
  },
  rowNumber: {
    type: Number,
    required: true
  },
  isSystemRecord: {
    type: Boolean,
    default: false
  },
  originalData: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});


recordSchema.index({ transactionId: 1, amount: 1 });
recordSchema.index({ referenceNumber: 1 });
recordSchema.index({ uploadJobId: 1 });
recordSchema.index({ date: 1 });
recordSchema.index({ isSystemRecord: 1 });

recordSchema.index({ 
  transactionId: 1, 
  uploadJobId: 1 
}, { unique: true });

module.exports = mongoose.model('Record', recordSchema);