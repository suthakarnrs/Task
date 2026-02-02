const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const UploadJob = require('../models/UploadJob');
const fileProcessor = require('../services/fileProcessor');
const { addFileProcessingJob } = require('../services/simpleQueueService');
const { authenticate, authorize, auditMiddleware } = require('../middleware/auth');

const router = express.Router();

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.csv', '.xlsx', '.xls'];
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 // 50MB
  }
});

const columnMappingSchema = Joi.object({
  transactionId: Joi.string().required(),
  amount: Joi.string().required(),
  referenceNumber: Joi.string().required(),
  date: Joi.string().required(),
  description: Joi.string().allow(''),
  category: Joi.string().allow('')
});

router.post('/file', 
  authenticate, 
  authorize('admin', 'analyst'),
  auditMiddleware('upload', 'upload_job'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const fileHash = fileProcessor.generateFileHash(req.file.path);
      
      const existingJob = await fileProcessor.checkDuplicateFile(fileHash);
      if (existingJob) {
        fs.unlinkSync(req.file.path);
        
        return res.status(409).json({
          message: 'File already processed',
          existingJobId: existingJob.jobId,
          uploadDate: existingJob.createdAt
        });
      }

      const jobId = uuidv4();
      const uploadJob = new UploadJob({
        jobId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        uploadedBy: req.user._id,
        fileHash,
        status: 'processing'
      });

      await uploadJob.save();

      res.status(202).json({
        message: 'File uploaded successfully',
        jobId,
        filename: req.file.originalname,
        fileSize: req.file.size,
        status: 'processing'
      });

    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      console.error('File upload error:', error);
      res.status(500).json({ message: 'File upload failed', error: error.message });
    }
  }
);

router.get('/preview/:jobId', 
  authenticate,
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const uploadJob = await UploadJob.findOne({ jobId });
      
      if (!uploadJob) {
        return res.status(404).json({ message: 'Upload job not found' });
      }

      if (req.user.role === 'viewer' && uploadJob.uploadedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const filePath = path.join(uploadsDir, uploadJob.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: 'File not found' });
      }

      let previewData;
      const fileExt = path.extname(uploadJob.originalName).toLowerCase();
      
      if (fileExt === '.csv') {
        previewData = await fileProcessor.parseCSV(filePath);
      } else {
        previewData = await fileProcessor.parseExcel(filePath);
      }

      const preview = previewData.slice(0, 20);
      const headers = preview.length > 0 ? Object.keys(preview[0]).filter(key => key !== 'rowNumber') : [];

      res.json({
        headers,
        preview,
        totalRows: previewData.length,
        filename: uploadJob.originalName
      });

    } catch (error) {
      console.error('Preview error:', error);
      res.status(500).json({ message: 'Failed to generate preview', error: error.message });
    }
  }
);

router.post('/mapping/:jobId',
  authenticate,
  authorize('admin', 'analyst'),
  auditMiddleware('update', 'upload_job'),
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const { error, value } = columnMappingSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const uploadJob = await UploadJob.findOne({ jobId });
      if (!uploadJob) {
        return res.status(404).json({ message: 'Upload job not found' });
      }

      if (uploadJob.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied' });
      }

      uploadJob.columnMapping = value;
      await uploadJob.save();

      await addFileProcessingJob({ jobId });

      res.json({
        message: 'Column mapping saved and processing started',
        jobId,
        columnMapping: value
      });

    } catch (error) {
      console.error('Column mapping error:', error);
      res.status(500).json({ message: 'Failed to save column mapping', error: error.message });
    }
  }
);

router.get('/status/:jobId',
  authenticate,
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const uploadJob = await UploadJob.findOne({ jobId })
        .populate('uploadedBy', 'username email')
        .lean();
      
      if (!uploadJob) {
        return res.status(404).json({ message: 'Upload job not found' });
      }

      if (req.user.role === 'viewer' && uploadJob.uploadedBy._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }

      res.json(uploadJob);

    } catch (error) {
      console.error('Status check error:', error);
      res.status(500).json({ message: 'Failed to get job status', error: error.message });
    }
  }
);

router.get('/jobs',
  authenticate,
  async (req, res) => {
    try {
      const { page = 1, limit = 10, status } = req.query;
      const skip = (page - 1) * limit;

      let query = {};
      
      if (req.user.role === 'viewer') {
        query.uploadedBy = req.user._id;
      }

      if (status) {
        query.status = status;
      }

      const [jobs, total] = await Promise.all([
        UploadJob.find(query)
          .populate('uploadedBy', 'username email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        UploadJob.countDocuments(query)
      ]);

      res.json({
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('Jobs list error:', error);
      res.status(500).json({ message: 'Failed to get upload jobs', error: error.message });
    }
  }
);

module.exports = router;