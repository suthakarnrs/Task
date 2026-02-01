const Queue = require('bull');
const redis = require('redis');

// Redis client setup
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis connected');
});

// Initialize Redis connection
redisClient.connect().catch(console.error);

// Create job queues
const fileProcessingQueue = new Queue('file processing', process.env.REDIS_URL || 'redis://localhost:6379');
const reconciliationQueue = new Queue('reconciliation', process.env.REDIS_URL || 'redis://localhost:6379');

// Queue configuration
const queueOptions = {
  removeOnComplete: 10, // Keep last 10 completed jobs
  removeOnFail: 50,     // Keep last 50 failed jobs
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
};

// Add job to file processing queue
const addFileProcessingJob = async (jobData) => {
  return fileProcessingQueue.add('process-file', jobData, {
    ...queueOptions,
    delay: 1000 // 1 second delay to ensure database consistency
  });
};

// Add job to reconciliation queue
const addReconciliationJob = async (jobData) => {
  return reconciliationQueue.add('reconcile-records', jobData, queueOptions);
};

// Get queue statistics
const getQueueStats = async (queueName) => {
  const queue = queueName === 'file-processing' ? fileProcessingQueue : reconciliationQueue;
  
  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getCompleted(),
    queue.getFailed()
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length
  };
};

// Clean old jobs
const cleanOldJobs = async () => {
  await fileProcessingQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
  await fileProcessingQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7 days
  await reconciliationQueue.clean(24 * 60 * 60 * 1000, 'completed');
  await reconciliationQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed');
};

// Schedule cleanup every hour
setInterval(cleanOldJobs, 60 * 60 * 1000);

module.exports = {
  fileProcessingQueue,
  reconciliationQueue,
  addFileProcessingJob,
  addReconciliationJob,
  getQueueStats,
  redisClient
};