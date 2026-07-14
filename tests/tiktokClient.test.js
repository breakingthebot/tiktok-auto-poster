/*
 * tests/tiktokClient.test.js
 * Tests for the TikTok Content Posting API client. fetch is injected as a
 * mock -- never a real call to TikTok.
 * Mirrors: src/tiktokClient.js
 * Created: 2026-07-13
 */

const { TIKTOK_INIT_POST_URL, initVideoPost } = require("../src/tiktokClient");

const SAMPLE_POST = {
  id: "post-1",
  caption: "Day 47 of building in public #buildinpublic",
  videoUrl: "https://storage.googleapis.com/example-bucket/day-47.mp4",
  privacyLevel: "PUBLIC_TO_EVERYONE",
  disableDuet: false,
  disableComment: false,
  disableStitch: true,
};

function makeFetchMock(responseBody, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: jest.fn().mockResolvedValue(responseBody),
  });
}

describe("initVideoPost", () => {
  it("posts the correct request shape to TikTok's real init-post endpoint", async () => {
    const fetchMock = makeFetchMock({ data: { publish_id: "v_pub_url~v2.123" }, error: { code: "ok" } });

    await initVideoPost("fake-access-token", SAMPLE_POST, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      TIKTOK_INIT_POST_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer fake-access-token" }),
      }),
    );

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody).toEqual({
      post_info: {
        title: SAMPLE_POST.caption,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: true,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: SAMPLE_POST.videoUrl,
      },
    });
  });

  it("returns the publish id on success", async () => {
    const fetchMock = makeFetchMock({ data: { publish_id: "v_pub_url~v2.123" }, error: { code: "ok" } });
    const result = await initVideoPost("token", SAMPLE_POST, fetchMock);
    expect(result).toEqual({ publishId: "v_pub_url~v2.123" });
  });

  it("throws with TikTok's error message when the API reports an error code", async () => {
    const fetchMock = makeFetchMock(
      { data: {}, error: { code: "access_token_invalid", message: "The access token is invalid or expired." } },
    );

    await expect(initVideoPost("bad-token", SAMPLE_POST, fetchMock)).rejects.toThrow(
      "The access token is invalid or expired.",
    );
  });

  it("throws a fallback message when the response is not ok and has no error message", async () => {
    const fetchMock = makeFetchMock({}, false, 500);
    await expect(initVideoPost("token", SAMPLE_POST, fetchMock)).rejects.toThrow("TikTok API returned status 500");
  });
});
