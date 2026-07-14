/*
 * scripts/seed-sample-post.js
 * Adds one sample draft post to the content_queue Firestore collection,
 * scheduled for right now, so a local or manual Dispatch run has
 * something to pick up. Populating the queue for real (a content-
 * authoring flow) is out of scope for this build -- see README Notes.
 * Run with: node scripts/seed-sample-post.js
 * Connects to: src/contentQueue.js
 * Created: 2026-07-13
 */

const { Firestore } = require("@google-cloud/firestore");
const { COLLECTION_NAME, STATUS } = require("../src/contentQueue");

async function main() {
  const firestore = new Firestore();
  const post = {
    caption: "Sample caption seeded for local testing #buildinpublic",
    videoUrl: "https://storage.googleapis.com/example-bucket/sample.mp4",
    privacyLevel: "SELF_ONLY",
    disableDuet: false,
    disableComment: false,
    disableStitch: false,
    scheduledAt: new Date().toISOString(),
    status: STATUS.SCHEDULED,
  };

  const docRef = await firestore.collection(COLLECTION_NAME).add(post);
  console.log(`Seeded sample post ${docRef.id}`);
}

main().catch((error) => {
  console.error("Failed to seed sample post:", error.message);
  process.exitCode = 1;
});
