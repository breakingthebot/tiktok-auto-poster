/*
 * tests/tasks.test.js
 * Tests for the Cloud Tasks enqueue wrapper. Uses an injected mock
 * client -- never calls real Cloud Tasks.
 * Mirrors: src/tasks.js
 * Created: 2026-07-13
 */

const { enqueuePublish } = require("../src/tasks");

function makeMockTasksClient() {
  return {
    queuePath: jest.fn((projectId, location, queue) => `projects/${projectId}/locations/${location}/queues/${queue}`),
    createTask: jest.fn().mockResolvedValue([{}]),
  };
}

describe("enqueuePublish", () => {
  it("builds the expected task with an OIDC token", async () => {
    const client = makeMockTasksClient();
    const post = { id: "post-1" };

    await enqueuePublish(
      client,
      "test-project",
      "us-central1",
      "publish-posts",
      "https://publish.example.com",
      "invoker@test-project.iam.gserviceaccount.com",
      post,
    );

    expect(client.queuePath).toHaveBeenCalledWith("test-project", "us-central1", "publish-posts");
    expect(client.createTask).toHaveBeenCalledWith({
      parent: "projects/test-project/locations/us-central1/queues/publish-posts",
      task: {
        httpRequest: expect.objectContaining({
          url: "https://publish.example.com",
          httpMethod: "POST",
          oidcToken: {
            serviceAccountEmail: "invoker@test-project.iam.gserviceaccount.com",
            audience: "https://publish.example.com",
          },
        }),
      },
    });
  });

  it("base64-encodes a JSON body containing only the postId", async () => {
    const client = makeMockTasksClient();
    await enqueuePublish(client, "p", "us-central1", "q", "https://x.example.com", "sa@x.iam.gserviceaccount.com", {
      id: "post-42",
    });

    const [{ task }] = client.createTask.mock.calls[0];
    const decodedBody = JSON.parse(Buffer.from(task.httpRequest.body, "base64").toString("utf8"));
    expect(decodedBody).toEqual({ postId: "post-42" });
  });

  it("propagates the client's error", async () => {
    const client = makeMockTasksClient();
    client.createTask.mockRejectedValue(new Error("queue not found"));

    await expect(
      enqueuePublish(client, "p", "us-central1", "q", "https://x.example.com", "sa@x.iam.gserviceaccount.com", {
        id: "post-1",
      }),
    ).rejects.toThrow("queue not found");
  });
});
