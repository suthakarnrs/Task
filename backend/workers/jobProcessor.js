const { fileProcessingQueue, reconciliationQueue } = require('../services/queueService');
const fileProcessor = require('../services/fileProcessor');
const reconciliationService = require('../services/reconciliationService');
const UploadJob = require('../models/UploadJob');

// File processing job handler
fileProcessingQueue.process('process-file', async (job) => {
  const { jobId } = job.data;
  
  try {
    console.log(`Processing file for job: ${jobId}`);
    
    const result = await fileProcessor.processFile(jobId);
    
    // If processing successful, trigger reconciliation
    if (result.success && result.processedRecords > 0) {
      const uploadJob = await UploadJob.findOne({ jobId });
      await reconciliationQueue.add('reconcile-records', {
        uploadJobId: uploadJob._id.toString(),
        userId: uploadJob.uploadedBy.toString()
      });
    }
    
    console.log(`File processing completed for job: ${jobId}`);
    return result;
    
  } catch (error) {
    console.error(`File processing failed for job ${jobId}:`, error);
    throw error;
  }
});

// Reconciliation job handler
reconciliationQueue.process('reconcile-records', async (job) => {
  const { uploadJobId, userId } = job.data;
  
  try {
    console.log(`Starting reconciliation for upload job: ${uploadJobId}`);
    
    const result = await reconciliationService.reconcileUploadJob(uploadJobId, userId);
    
    console.log(`Reconciliation completed for upload job: ${uploadJobId}`);
    return result;
    
  } catch (error) {
    console.error(`Reconciliation failed for upload job ${uploadJobId}:`, error);
    throw error;
  }
});

// Job event handlers
fileProcessingQueue.on('completed', (job, result) => {
  console.log(`File processing job ${job.id} completed:`, result);
});

fileProcessingQueue.on('failed', (job, err) => {
  console.error(`File processing job ${job.id} failed:`, err.message);
});

reconciliationQueue.on('completed', (job, result) => {
  console.log(`Reconciliation job ${job.id} completed:`, result);
});

reconciliationQueue.on('failed', (job, err) => {
  console.error(`Reconciliation job ${job.id} failed:`, err.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down job processors...');
  await fileProcessingQueue.close();
  await reconciliationQueue.close();
  process.exit(0);
});

console.log('Job processors started');

module.exports = {
  fileProcessingQueue,
  reconciliationQueue
};