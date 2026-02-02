const Queue = require('bull');
const redis = require('redis');

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis connected');
});

redisClient.connect().catch(console.error);

const fileProcessingQueue = new Queue('file processing', process.env.REDIS_URL || 'redis://localhost:6379');
const reconciliationQueue = new Queue('reconciliation', process.env.REDIS_URL || 'redis://localhost:6379');

const queueOptions = {
  removeOnComplete: 10, 
  removeOnFail: 50,     
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
};

const addFileProcessingJob = async (jobData) => {
  return fileProcessingQueue.add('process-file', jobData, {
    ...queueOptions,
    delay: 1000 
  });
};

const addReconciliationJob = async (jobData) => {
  return reconciliationQueue.add('reconcile-records', jobData, queueOptions);
};

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

const cleanOldJobs = async () => {
  await fileProcessingQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 24 hours
  await fileProcessingQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7 days
  await reconciliationQueue.clean(24 * 60 * 60 * 1000, 'completed');
  await reconciliationQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed');
};

setInterval(cleanOldJobs, 60 * 60 * 1000);

module.exports = {
  fileProcessingQueue,
  reconciliationQueue,
  addFileProcessingJob,
  addReconciliationJob,
  getQueueStats,
  redisClient
};