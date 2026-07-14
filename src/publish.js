/*
 * src/publish.js
 * Publish is invoked once per due post, via Cloud Tasks. Re-reads the
 * post from Firestore by id (never trusts the task payload's data
 * directly), calls TikTok's real init-post API, and updates the post's
 * status based on the result.
 * Connects to: config.js, contentQueue.js, secrets.js, tiktokClient.js
 * Created: 2026-07-13
 */

const functions = require("@google-cloud/functions-framework");
const { Firestore } = require("@google-cloud/firestore");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");

const { loadConfig, MissingConfigError } = require("./config");
const {
  getPostById,
  markPostPublishing,
  markPostPublished,
  markPostFailed,
} = require("./contentQueue");
const { getSecret } = require("./secrets");
const { initVideoPost } = require("./tiktokClient");
const { logError, logInfo } = require("./logger");

/**
 * Publishes one post (by id) to TikTok and updates its status in Firestore.
 *
 * @param {string} postId - The post to publish.
 * @param {{ firestore: object, secretManagerClient: object, fetchImpl?: typeof fetch }} deps - Injected dependencies.
 * @returns {Promise<{ postId: string, publishId: string }>} The publish result.
 */
async function runPublish(postId, deps) {
  const config = loadConfig();

  const post = await getPostById(postId, deps.firestore);
  if (!post) {
    throw new Error(`Post ${postId} not found in the content queue.`);
  }

  await markPostPublishing(postId, deps.firestore);
  logInfo("publish_started", { postId });

  try {
    const accessToken = await getSecret(
      config.gcpProjectId,
      config.tiktokAccessTokenSecretId,
      "latest",
      deps.secretManagerClient,
    );
    const { publishId } = await initVideoPost(accessToken, post, deps.fetchImpl);
    await markPostPublished(postId, publishId, deps.firestore);
    logInfo("publish_completed", { postId, publishId });
    return { postId, publishId };
  } catch (error) {
    await markPostFailed(postId, error.message, deps.firestore);
    throw error;
  }
}

/**
 * The functions-framework HTTP handler Cloud Tasks invokes, once per due post.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function publishHandler(req, res) {
  const { postId } = req.body || {};
  if (!postId) {
    res.status(400).json({ error: "Missing postId in request body." });
    return;
  }

  try {
    const result = await runPublish(postId, {
      firestore: new Firestore(),
      secretManagerClient: new SecretManagerServiceClient(),
    });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof MissingConfigError) {
      logError("publish_config_error", { error: error.message });
      res.status(500).json({ error: error.message });
      return;
    }
    logError("publish_failed", { postId, error: error.message });
    res.status(500).json({ error: "Publish failed. See logs for details." });
  }
}

functions.http("publish", publishHandler);

module.exports = { runPublish, publishHandler };
