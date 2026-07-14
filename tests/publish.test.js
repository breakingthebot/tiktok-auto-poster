/*
 * tests/publish.test.js
 * Tests for the Publish orchestration logic (runPublish, fully
 * injectable) and the HTTP handler's request/error handling.
 * @google-cloud/firestore and @google-cloud/secret-manager are
 * auto-mocked so publishHandler (which constructs real clients before
 * delegating to runPublish) never opens a real gRPC channel, even just
 * from client construction.
 * Mirrors: src/publish.js
 * Created: 2026-07-13
 */

jest.mock("@google-cloud/firestore");
jest.mock("@google-cloud/secret-manager");

const REQUIRED_ENV = {
  GCP_PROJECT_ID: "test-project",
  TIKTOK_CLIENT_KEY: "aw_client_key",
  CLOUD_TASKS_QUEUE: "publish-posts",
  CLOUD_TASKS_LOCATION: "us-central1",
  PUBLISH_FUNCTION_URL: "https://publish.example.com",
  TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL: "invoker@test-project.iam.gserviceaccount.com",
};

function setEnv() {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    process.env[key] = value;
  }
}

function clearEnv() {
  for (const key of Object.keys(REQUIRED_ENV)) {
    delete process.env[key];
  }
}

function makeMockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const SAMPLE_POST = {
  id: "post-1",
  caption: "hi",
  videoUrl: "https://storage.googleapis.com/example/video.mp4",
  privacyLevel: "PUBLIC_TO_EVERYONE",
};

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  clearEnv();
});

describe("runPublish", () => {
  it("publishes the post and marks it published on success", async () => {
    setEnv();
    jest.doMock("../src/contentQueue", () => ({
      getPostById: jest.fn().mockResolvedValue(SAMPLE_POST),
      markPostPublishing: jest.fn().mockResolvedValue(undefined),
      markPostPublished: jest.fn().mockResolvedValue(undefined),
      markPostFailed: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("../src/secrets", () => ({
      getCredential: jest.fn().mockResolvedValue("fake-access-token"),
    }));
    jest.doMock("../src/tiktokClient", () => ({
      initVideoPost: jest.fn().mockResolvedValue({ publishId: "v_pub_url~123" }),
    }));

    const { runPublish } = require("../src/publish");
    const contentQueue = require("../src/contentQueue");

    const result = await runPublish("post-1", { firestore: {}, secretManagerClient: {} });

    expect(result).toEqual({ postId: "post-1", publishId: "v_pub_url~123" });
    expect(contentQueue.markPostPublishing).toHaveBeenCalledWith("post-1", {});
    expect(contentQueue.markPostPublished).toHaveBeenCalledWith("post-1", "v_pub_url~123", {});
    expect(contentQueue.markPostFailed).not.toHaveBeenCalled();
  });

  it("marks the post failed and rethrows when TikTok's API call fails", async () => {
    setEnv();
    jest.doMock("../src/contentQueue", () => ({
      getPostById: jest.fn().mockResolvedValue(SAMPLE_POST),
      markPostPublishing: jest.fn().mockResolvedValue(undefined),
      markPostPublished: jest.fn().mockResolvedValue(undefined),
      markPostFailed: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("../src/secrets", () => ({
      getCredential: jest.fn().mockResolvedValue("fake-access-token"),
    }));
    jest.doMock("../src/tiktokClient", () => ({
      initVideoPost: jest.fn().mockRejectedValue(new Error("The access token is invalid or expired.")),
    }));

    const { runPublish } = require("../src/publish");
    const contentQueue = require("../src/contentQueue");

    await expect(runPublish("post-1", { firestore: {}, secretManagerClient: {} })).rejects.toThrow(
      "The access token is invalid or expired.",
    );
    expect(contentQueue.markPostFailed).toHaveBeenCalledWith(
      "post-1",
      "The access token is invalid or expired.",
      {},
    );
  });

  it("throws when the post no longer exists in the queue", async () => {
    setEnv();
    jest.doMock("../src/contentQueue", () => ({
      getPostById: jest.fn().mockResolvedValue(null),
      markPostPublishing: jest.fn(),
      markPostPublished: jest.fn(),
      markPostFailed: jest.fn(),
    }));

    const { runPublish } = require("../src/publish");
    await expect(runPublish("missing-post", { firestore: {}, secretManagerClient: {} })).rejects.toThrow(
      "Post missing-post not found in the content queue.",
    );
  });

  it("throws MissingConfigError when required config is absent", async () => {
    clearEnv();
    const { runPublish } = require("../src/publish");
    const { MissingConfigError } = require("../src/config");

    await expect(runPublish("post-1", { firestore: {}, secretManagerClient: {} })).rejects.toBeInstanceOf(
      MissingConfigError,
    );
  });
});

describe("publishHandler", () => {
  it("returns 400 when postId is missing from the request body", async () => {
    const { publishHandler } = require("../src/publish");
    const res = makeMockRes();

    await publishHandler({ body: {} }, res);

    expect(res.statusCode).toBe(400);
  });

  it("returns 500 with the specific message on a config error", async () => {
    clearEnv();
    const { publishHandler } = require("../src/publish");
    const res = makeMockRes();

    await publishHandler({ body: { postId: "post-1" } }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/GCP_PROJECT_ID/);
  });
});
