/*
 * src/tasks.js
 * Enqueues one Cloud Task per due post, targeting the Publish function.
 * Cloud Tasks gives per-post retry-with-backoff independent of the
 * others -- same reasoning as build #3's Dispatch/Check split. The task
 * carries an OIDC token so Cloud Tasks authenticates against Publish,
 * which is deployed with --no-allow-unauthenticated.
 * Connects to: config.js, dispatch.js
 * Created: 2026-07-13
 */

const { logInfo } = require("./logger");

/**
 * Creates a Cloud Task that will POST { postId } to targetUrl (the
 * Publish function's URL). Only the id is sent -- Publish re-reads the
 * full post from Firestore so it always acts on current data.
 *
 * @param {{ queuePath: Function, createTask: Function }} client - The Cloud Tasks client (real or injected fake).
 * @param {string} projectId
 * @param {string} location
 * @param {string} queue
 * @param {string} targetUrl
 * @param {string} oidcServiceAccountEmail
 * @param {{ id: string }} post - The queued post to enqueue a publish task for.
 * @returns {Promise<void>}
 */
async function enqueuePublish(client, projectId, location, queue, targetUrl, oidcServiceAccountEmail, post) {
  const parent = client.queuePath(projectId, location, queue);

  const task = {
    httpRequest: {
      url: targetUrl,
      httpMethod: "POST",
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify({ postId: post.id })).toString("base64"),
      oidcToken: {
        serviceAccountEmail: oidcServiceAccountEmail,
        audience: targetUrl,
      },
    },
  };

  logInfo("task_enqueue_started", { postId: post.id, queue: parent });
  await client.createTask({ parent, task });
  logInfo("task_enqueue_succeeded", { postId: post.id });
}

module.exports = { enqueuePublish };
