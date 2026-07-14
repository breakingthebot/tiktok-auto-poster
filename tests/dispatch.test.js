/*
 * tests/dispatch.test.js
 * Tests for the Dispatch orchestration logic (runDispatch, fully
 * injectable) and the HTTP handler's error-response shape. Uses
 * jest.doMock + jest.resetModules per test since contentQueue.js/tasks.js
 * need different mocked behavior across tests. @google-cloud/firestore and
 * @google-cloud/tasks are auto-mocked so dispatchHandler (which
 * constructs real clients before delegating to runDispatch) never opens a
 * real gRPC channel, even just from client construction.
 * Mirrors: src/dispatch.js
 * Created: 2026-07-13
 */

jest.mock("@google-cloud/firestore");
jest.mock("@google-cloud/tasks");

const REQUIRED_ENV = {
  GCP_PROJECT_ID: "test-project",
  TIKTOK_CLIENT_KEY: "aw_client_key",
  TIKTOK_ACCESS_TOKEN_SECRET_ID: "tiktok-access-token",
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

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  clearEnv();
});

describe("runDispatch", () => {
  it("enqueues one task per due post", async () => {
    setEnv();
    jest.doMock("../src/contentQueue", () => ({
      getDuePosts: jest.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
    }));
    jest.doMock("../src/tasks", () => ({
      enqueuePublish: jest.fn().mockResolvedValue(undefined),
    }));

    const { runDispatch } = require("../src/dispatch");
    const summary = await runDispatch({ firestore: {}, tasksClient: {} });

    expect(summary).toEqual({ duePostCount: 2, tasksEnqueued: 2 });
  });

  it("continues past an individual enqueue failure", async () => {
    setEnv();
    jest.doMock("../src/contentQueue", () => ({
      getDuePosts: jest.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]),
    }));
    jest.doMock("../src/tasks", () => ({
      enqueuePublish: jest
        .fn()
        .mockRejectedValueOnce(new Error("cloud tasks unavailable"))
        .mockResolvedValueOnce(undefined),
    }));

    const { runDispatch } = require("../src/dispatch");
    const summary = await runDispatch({ firestore: {}, tasksClient: {} });

    expect(summary).toEqual({ duePostCount: 2, tasksEnqueued: 1 });
  });

  it("throws MissingConfigError when required config is absent", async () => {
    clearEnv();
    const { runDispatch } = require("../src/dispatch");
    const { MissingConfigError } = require("../src/config");

    await expect(runDispatch({ firestore: {}, tasksClient: {} })).rejects.toBeInstanceOf(MissingConfigError);
  });
});

describe("dispatchHandler", () => {
  it("returns 500 with the specific message on a config error", async () => {
    clearEnv();
    const { dispatchHandler } = require("../src/dispatch");

    const res = makeMockRes();
    await dispatchHandler({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/GCP_PROJECT_ID/);
  });

  it("returns 500 with a safe generic message on an unexpected error", async () => {
    setEnv();
    jest.doMock("../src/contentQueue", () => ({
      getDuePosts: jest.fn().mockRejectedValue(new Error("Firestore is down")),
    }));

    const { dispatchHandler } = require("../src/dispatch");
    const res = makeMockRes();
    await dispatchHandler({}, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe("Dispatch failed. See logs for details.");
  });
});
