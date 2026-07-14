/*
 * tests/secrets.test.js
 * Tests for the Secret Manager wrapper. Uses an injected mock client --
 * never calls real Secret Manager.
 * Mirrors: src/secrets.js
 * Created: 2026-07-13
 */

const { getSecret, getCredential } = require("../src/secrets");

describe("getSecret", () => {
  it("returns the decoded payload", async () => {
    const mockClient = {
      accessSecretVersion: jest.fn().mockResolvedValue([
        { payload: { data: Buffer.from("tiktok-access-token-value") } },
      ]),
    };

    const value = await getSecret("test-project", "tiktok-access-token", "latest", mockClient);

    expect(value).toBe("tiktok-access-token-value");
    expect(mockClient.accessSecretVersion).toHaveBeenCalledWith({
      name: "projects/test-project/secrets/tiktok-access-token/versions/latest",
    });
  });

  it("uses the requested version", async () => {
    const mockClient = {
      accessSecretVersion: jest.fn().mockResolvedValue([{ payload: { data: Buffer.from("value") } }]),
    };

    await getSecret("test-project", "tiktok-access-token", "3", mockClient);

    expect(mockClient.accessSecretVersion).toHaveBeenCalledWith({
      name: "projects/test-project/secrets/tiktok-access-token/versions/3",
    });
  });
});

describe("getCredential", () => {
  function mockClientWithBlob(payloadObject) {
    return {
      accessSecretVersion: jest
        .fn()
        .mockResolvedValue([{ payload: { data: Buffer.from(JSON.stringify(payloadObject), "utf8") } }]),
    };
  }

  it("returns the requested key from the shared blob", async () => {
    const mockClient = mockClientWithBlob({ tiktok_access_token: "hunter2", other_key: "unused" });

    const value = await getCredential("test-project", "app-credentials", "tiktok_access_token", mockClient);

    expect(value).toBe("hunter2");
  });

  it("throws on invalid JSON", async () => {
    const mockClient = {
      accessSecretVersion: jest.fn().mockResolvedValue([{ payload: { data: Buffer.from("not json", "utf8") } }]),
    };

    await expect(
      getCredential("test-project", "app-credentials", "tiktok_access_token", mockClient),
    ).rejects.toThrow("not valid JSON");
  });

  it("throws when the key is missing", async () => {
    const mockClient = mockClientWithBlob({ other_key: "unused" });

    await expect(
      getCredential("test-project", "app-credentials", "tiktok_access_token", mockClient),
    ).rejects.toThrow("no key named 'tiktok_access_token'");
  });
});
