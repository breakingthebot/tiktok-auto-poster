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
    expect(config.cloudTasksQueue).toBe("publish-posts");
    expect(config.cloudTasksLocation).toBe("us-central1");
    expect(config.publishFunctionUrl).toBe("https://publish-abc123.a.run.app");
    expect(config.tasksInvokerServiceAccountEmail).toBe("invoker@test-project.iam.gserviceaccount.com");
  });

  it("applies credentials defaults", () => {
    setEnv();
    const config = loadConfig();

    expect(config.credentialsSecretId).toBe("app-credentials");
    expect(config.tiktokCredentialKey).toBe("tiktok_access_token");
  });

  it("honors credentials overrides", () => {
    setEnv({ CREDENTIALS_SECRET_ID: "other-secret", TIKTOK_CREDENTIAL_KEY: "other_key" });
    const config = loadConfig();

    expect(config.credentialsSecretId).toBe("other-secret");
    expect(config.tiktokCredentialKey).toBe("other_key");
  });

  it.each(Object.keys(REQUIRED_ENV))("throws when %s is missing", (missingKey) => {
    setEnv();
    delete process.env[missingKey];

    expect(() => loadConfig()).toThrow(MissingConfigError);
  });
});
