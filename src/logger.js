/*
 * src/logger.js
 * Structured JSON logging matching Google Cloud's structured-logging
 * convention. Same pattern as builds #1-4 in this series.
 * Connects to: every other module in src/.
 * Created: 2026-07-13
 */

const VALID_SEVERITIES = new Set(["DEBUG", "INFO", "WARNING", "ERROR"]);

/**
 * Emits one structured log line. Never include secret values in `fields`.
 *
 * @param {"DEBUG"|"INFO"|"WARNING"|"ERROR"} severity - The log severity.
 * @param {string} event - The event name/message.
 * @param {Record<string, unknown>} [fields] - Extra structured fields.
 * @returns {void}
 */
function logEvent(severity, event, fields = {}) {
  if (!VALID_SEVERITIES.has(severity)) {
    throw new Error(`Unknown log severity: ${severity}`);
  }

  const entry = { severity, message: event, ...fields };
  const line = JSON.stringify(entry);
  const stream = severity === "ERROR" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

const logDebug = (event, fields) => logEvent("DEBUG", event, fields);
const logInfo = (event, fields) => logEvent("INFO", event, fields);
const logWarning = (event, fields) => logEvent("WARNING", event, fields);
const logError = (event, fields) => logEvent("ERROR", event, fields);

module.exports = { logDebug, logInfo, logWarning, logError, logEvent };
