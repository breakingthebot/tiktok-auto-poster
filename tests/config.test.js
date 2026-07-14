/*
 * tests/config.test.js
 * Tests for environment-variable configuration loading and validation.
 * Mirrors: src/config.js
 * Created: 2026-07-13
 */

const { MissingConfigError, loadConfig } = require("../src/config");

const REQUIRED_ENV = {
  GCP_PROJECT_ID: "test-project",
  TIKTOK_CLIENT_KEY: "aw_client_key_123",
  TIKTOK_ACCESS_TOKEN_SECRET_ID: "tiktok-access-token",
  CLOUD_TASKS_QUEUE: "publish-posts",
  CLOUD_TASKS_LOCATION: "us-central1",
  PUBLISH_FUNCTION_URL: "https://publish-abc123.a.run.app",
  TASKS_INVOKER_SERVICE_ACCOUNT_EMAIL: "invoker@test-project.iam.gserviceaccount.com",
};

function setEnv(overrides = {}) {
  for (const [key, value] of Object.entries({ ...REQUIRED_ENV, ...overrides })) {
    process.env[key] = value;
  }
}

function clearEnv() {
  for (const key of Object.keys(REQUIRED_ENV)) {
    delete process.env[key];
  }
}

afterEach(() => {
  clearEnv();
});

describe("loadConfig", () => {
  it("reads all required fields", () => {
    setEnv();
    const config = loadConfig();

    expect(config.gcpProjectId).toBe("test-project");
    expect(config.tiktokClientKey).toBe("aw_client_key_123");
    expect(config.tiktokAccessTokenSecretId).toBe("tiktok-access-token");
    expect(config.cloudTasksQueue).toBe("publish-posts");
    expect(config.cloudTasksLocation).toBe("us-central1");
    expect(config.publishFunctionUrl).toBe("https://publish-abc123.a.run.app");
    expect(config.tasksInvokerServiceAccountEmail).toBe("invoker@test-project.iam.gserviceaccount.com");
  });

  it.each(Object.keys(REQUIRED_ENV))("throws when %s is missing", (missingKey) => {
    setEnv();
    delete process.env[missingKey];

    expect(() => loadConfig()).toThrow(MissingConfigError);
  });
});
