/*
 * src/contentQueue.js
 * Reads/writes drafted posts in the `content_queue` Firestore collection.
 * Populating the queue (adding drafts) is out of scope for this build --
 * see README Notes -- this module only finds and updates posts that are
 * already there. This is the only module that talks to Firestore for the
 * queue -- callers go through these functions, never the Firestore client
 * directly.
 * Connects to: dispatch.js, publish.js
 * Created: 2026-07-13
 */

const { Firestore } = require("@google-cloud/firestore");
const { logInfo } = require("./logger");

const COLLECTION_NAME = "content_queue";

const STATUS = {
  SCHEDULED: "scheduled",
  PUBLISHING: "publishing",
  PUBLISHED: "published",
  FAILED: "failed",
};

/**
 * @typedef {object} QueuedPost
 * @property {string} id
 * @property {string} videoUrl - A URL TikTok can fetch the video from (PULL_FROM_URL mode).
 * @property {string} caption
 * @property {"PUBLIC_TO_EVERYONE"|"MUTUAL_FOLLOW_FRIENDS"|"SELF_ONLY"} privacyLevel
 * @property {boolean} disableDuet
 * @property {boolean} disableComment
 * @property {boolean} disableStitch
 * @property {string} scheduledAt - ISO timestamp.
 * @property {string} status
 */

/**
 * Finds every queued post that's due to be published (status is
 * "scheduled" and scheduledAt is at or before `now`).
 *
 * @param {Date} now - The current time to compare against.
 * @param {import('@google-cloud/firestore').Firestore} [firestore] - Injectable for tests, defaults to a real client.
 * @returns {Promise<QueuedPost[]>} The due posts.
 */
async function getDuePosts(now, firestore) {
  const client = firestore || new Firestore();

  const snapshot = await client
    .collection(COLLECTION_NAME)
    .where("status", "==", STATUS.SCHEDULED)
    .where("scheduledAt", "<=", now.toISOString())
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Fetches one post by id. Publish re-reads by id (rather than trusting the
 * Cloud Task's payload data) so it always acts on the post's current
 * state, not a possibly-stale snapshot from when Dispatch ran.
 *
 * @param {string} postId - The post's document id.
 * @param {import('@google-cloud/firestore').Firestore} [firestore] - Injectable for tests, defaults to a real client.
 * @returns {Promise<QueuedPost|null>} The post, or null if it no longer exists.
 */
async function getPostById(postId, firestore) {
  const client = firestore || new Firestore();
  const doc = await client.collection(COLLECTION_NAME).doc(postId).get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() };
}

/**
 * Marks a post as currently being published, to avoid a second Dispatch
 * run picking it up again before Publish finishes.
 *
 * @param {string} postId - The post's document id.
 * @param {import('@google-cloud/firestore').Firestore} [firestore] - Injectable for tests, defaults to a real client.
 * @returns {Promise<void>}
 */
async function markPostPublishing(postId, firestore) {
  const client = firestore || new Firestore();
  await client.collection(COLLECTION_NAME).doc(postId).update({ status: STATUS.PUBLISHING });
  logInfo("post_marked_publishing", { postId });
}

/**
 * Marks a post as successfully published.
 *
 * @param {string} postId - The post's document id.
 * @param {string} publishId - The TikTok publish id returned by the init call.
 * @param {import('@google-cloud/firestore').Firestore} [firestore] - Injectable for tests, defaults to a real client.
 * @returns {Promise<void>}
 */
async function markPostPublished(postId, publishId, firestore) {
  const client = firestore || new Firestore();
  await client
    .collection(COLLECTION_NAME)
    .doc(postId)
    .update({ status: STATUS.PUBLISHED, publishId, publishedAt: new Date().toISOString() });
  logInfo("post_marked_published", { postId, publishId });
}

/**
 * Marks a post as failed to publish, with an error message for diagnosis.
 *
 * @param {string} postId - The post's document id.
 * @param {string} errorMessage - What went wrong.
 * @param {import('@google-cloud/firestore').Firestore} [firestore] - Injectable for tests, defaults to a real client.
 * @returns {Promise<void>}
 */
async function markPostFailed(postId, errorMessage, firestore) {
  const client = firestore || new Firestore();
  await client
    .collection(COLLECTION_NAME)
    .doc(postId)
    .update({ status: STATUS.FAILED, error: errorMessage });
  logInfo("post_marked_failed", { postId, error: errorMessage });
}

module.exports = {
  COLLECTION_NAME,
  STATUS,
  getDuePosts,
  getPostById,
  markPostPublishing,
  markPostPublished,
  markPostFailed,
};
