/*
 * src/dispatch.js
 * Dispatch is the Cloud Function Cloud Scheduler invokes at each
 * configured posting time. It doesn't publish anything itself -- it
 * finds every due post in the queue and fans out one Cloud Task per post
 * to Publish, so each post's publish attempt (and any retry) happens
 * independently.
 * Connects to: config.js, contentQueue.js, tasks.js, publish.js
 * Created: 2026-07-13
 */

const functions = require("@google-cloud/functions-framework");
const { CloudTasksClient } = require("@google-cloud/tasks");
const { Firestore } = require("@google-cloud/firestore");

const { loadConfig, MissingConfigError } = require("./config");
const { getDuePosts } = require("./contentQueue");
const { enqueuePublish } = require("./tasks");
const { logError, logInfo } = require("./logger");

/**
 * Finds due posts and enqueues one Cloud Task per post.
 *
 * @param {{ firestore: object, tasksClient: object }} deps - Injected dependencies.
 * @returns {Promise<{ duePostCount: number, tasksEnqueued: number }>} The run summary.
 */
async function runDispatch(deps) {
  const config = loadConfig();
  const duePosts = await getDuePosts(new Date(), deps.firestore);

  logInfo("dispatch_started", { duePostCount: duePosts.length });

  let tasksEnqueued = 0;
  for (const post of duePosts) {
    try {
      // eslint-disable-next-line no-await-in-loop -- each enqueue is independent and small in volume.
      await enqueuePublish(
        deps.tasksClient,
        config.gcpProjectId,
        config.cloudTasksLocation,
        config.cloudTasksQueue,
        config.publishFunctionUrl,
        config.tasksInvokerServiceAccountEmail,
        post,
      );
      tasksEnqueued += 1;
    } catch (error) {
      logError("task_enqueue_failed", { postId: post.id, error: error.message });
    }
  }

  logInfo("dispatch_completed", { duePostCount: duePosts.length, tasksEnqueued });
  return { duePostCount: duePosts.length, tasksEnqueued };
}

/**
 * The functions-framework HTTP handler Cloud Scheduler invokes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
async function dispatchHandler(req, res) {
  try {
    const summary = await runDispatch({ firestore: new Firestore(), tasksClient: new CloudTasksClient() });
    res.status(200).json(summary);
  } catch (error) {
    if (error instanceof MissingConfigError) {
      logError("dispatch_config_error", { error: error.message });
      res.status(500).json({ error: error.message });
      return;
    }
    logError("dispatch_failed", { error: error.message });
    res.status(500).json({ error: "Dispatch failed. See logs for details." });
  }
}

functions.http("dispatch", dispatchHandler);

module.exports = { runDispatch, dispatchHandler };
