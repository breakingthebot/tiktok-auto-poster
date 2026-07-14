/*
 * src/tiktokClient.js
 * Calls TikTok's real Content Posting API (Direct Post, PULL_FROM_URL
 * mode) to publish a queued video. This is a real integration, not a
 * mock -- unlike some earlier builds' core capability, there genuinely is
 * a real API here; it's just not exercised end-to-end without a real
 * TikTok Developer app and a verified OAuth access token (see README).
 * Connects to: publish.js
 * Created: 2026-07-13
 */

const TIKTOK_INIT_POST_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/";

/**
 * @typedef {object} InitVideoPostResult
 * @property {string} publishId
 */

/**
 * Calls TikTok's video init-post endpoint to publish a queued post by URL
 * (PULL_FROM_URL mode -- TikTok fetches the video itself, so this app
 * never handles raw video bytes).
 *
 * @param {string} accessToken - The TikTok OAuth access token.
 * @param {import('./contentQueue').QueuedPost} post - The post to publish.
 * @param {typeof fetch} [fetchImpl] - Injectable for tests, defaults to the global fetch.
 * @returns {Promise<InitVideoPostResult>} The publish id TikTok assigned.
 */
async function initVideoPost(accessToken, post, fetchImpl = fetch) {
  const body = {
    post_info: {
      title: post.caption,
      privacy_level: post.privacyLevel,
      disable_duet: Boolean(post.disableDuet),
      disable_comment: Boolean(post.disableComment),
      disable_stitch: Boolean(post.disableStitch),
    },
    source_info: {
      source: "PULL_FROM_URL",
      video_url: post.videoUrl,
    },
  };

  const response = await fetchImpl(TIKTOK_INIT_POST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok || payload.error?.code !== "ok") {
    const message = payload.error?.message || `TikTok API returned status ${response.status}`;
    throw new Error(message);
  }

  return { publishId: payload.data.publish_id };
}

module.exports = { TIKTOK_INIT_POST_URL, initVideoPost };
