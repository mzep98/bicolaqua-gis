const QUEUE_KEY = 'bicolaqua_offline_inspections_v1';
const CACHE_KEY = 'bicolaqua_cached_points_v3';

export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

export function enqueueInspection(logEntry) {
  const queue = getOfflineQueue();
  queue.push({
    ...logEntry,
    local_queue_id: crypto.randomUUID(),
    recorded_at: new Date().toISOString(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return queue;
}

export function clearOfflineQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export function saveCachedWaterPoints(points) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(points));
}

export function loadCachedWaterPoints() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || [];
  } catch {
    return [];
  }
}