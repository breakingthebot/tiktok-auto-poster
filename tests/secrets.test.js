/*
 * tests/secrets.test.js
 * Tests for the Secret Manager wrapper. Uses an injected mock client --
 * never calls real Secret Manager.
 * Mirrors: src/secrets.js
 * Created: 2026-07-13
 */

const { getSecret } = require("../src/secrets");

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
