/*
 * src/secrets.js
 * Thin wrapper around Google Secret Manager. This is the ONLY module that
 * fetches secret values -- callers pass a secret ID (a name, not a value)
 * and get the current version's plaintext back. Never log the returned
 * value.
 * Connects to: config.js, publish.js
 * Created: 2026-07-13
 */

const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const { logInfo } = require("./logger");

/**
 * Fetches a secret's plaintext value from Secret Manager.
 *
 * @param {string} projectId - The GCP project holding the secret.
 * @param {string} secretId - The secret's resource ID (name, not value).
 * @param {string} [version] - The secret version, defaults to "latest".
 * @param {{ accessSecretVersion: Function }} [client] - Injectable for tests, defaults to a real client.
 * @returns {Promise<string>} The decoded secret value.
 */
async function getSecret(projectId, secretId, version = "latest", client) {
  const secretClient = client || new SecretManagerServiceClient();
  const name = `projects/${projectId}/secrets/${secretId}/versions/${version}`;

  logInfo("secret_fetch_started", { secretId, version });
  const [response] = await secretClient.accessSecretVersion({ name });
  logInfo("secret_fetch_succeeded", { secretId, version });

  return response.payload.data.toString("utf8");
}

module.exports = { getSecret };
