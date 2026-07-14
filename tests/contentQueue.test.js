/*
 * tests/contentQueue.test.js
 * Tests for the Firestore-backed content queue. Uses an injected mock
 * client -- never calls real Firestore.
 * Mirrors: src/contentQueue.js
 * Created: 2026-07-13
 */

const {
  COLLECTION_NAME,
  getDuePosts,
  getPostById,
  markPostPublishing,
  markPostPublished,
  markPostFailed,
} = require("../src/contentQueue");

function makeMockFirestore({ dueDocs = [], docsById = {} } = {}) {
  const updateSpy = jest.fn().mockResolvedValue(undefined);
  const whereSpy = jest.fn();
  const getSpy = jest.fn().mockResolvedValue({
    docs: dueDocs.map((data) => ({ id: data.id, data: () => data })),
  });

  const query = { where: whereSpy, get: getSpy };
  whereSpy.mockReturnValue(query);

  const docSpy = jest.fn((id) => ({
    get: jest.fn().mockResolvedValue(
      docsById[id] ? { exists: true, id, data: () => docsById[id] } : { exists: false },
    ),
    update: updateSpy,
  }));

  const collectionSpy = jest.fn(() => ({ where: whereSpy, get: getSpy, doc: docSpy }));

  return { firestore: { collection: collectionSpy }, collectionSpy, whereSpy, getSpy, docSpy, updateSpy };
}

describe("getDuePosts", () => {
  it("queries the content_queue collection filtered by status and scheduledAt", async () => {
    const { firestore, collectionSpy, whereSpy } = makeMockFirestore({
      dueDocs: [{ caption: "hi", videoUrl: "https://x/video.mp4" }],
    });

    const posts = await getDuePosts(new Date("2026-07-13T12:00:00.000Z"), firestore);

    expect(collectionSpy).toHaveBeenCalledWith(COLLECTION_NAME);
    expect(whereSpy).toHaveBeenCalledWith("status", "==", "scheduled");
    expect(whereSpy).toHaveBeenCalledWith("scheduledAt", "<=", "2026-07-13T12:00:00.000Z");
    expect(posts).toHaveLength(1);
    expect(posts[0].caption).toBe("hi");
  });

  it("returns an empty array when nothing is due", async () => {
    const { firestore } = makeMockFirestore({ dueDocs: [] });
    const posts = await getDuePosts(new Date(), firestore);
    expect(posts).toEqual([]);
  });
});

describe("getPostById", () => {
  it("returns the post with its id when it exists", async () => {
    const { firestore } = makeMockFirestore({ docsById: { abc: { caption: "hi" } } });
    const post = await getPostById("abc", firestore);
    expect(post).toEqual({ id: "abc", caption: "hi" });
  });

  it("returns null when the post does not exist", async () => {
    const { firestore } = makeMockFirestore({ docsById: {} });
    const post = await getPostById("missing", firestore);
    expect(post).toBeNull();
  });
});

describe("markPostPublishing", () => {
  it("updates the post's status to publishing", async () => {
    const { firestore, updateSpy } = makeMockFirestore();
    await markPostPublishing("abc", firestore);
    expect(updateSpy).toHaveBeenCalledWith({ status: "publishing" });
  });
});

describe("markPostPublished", () => {
  it("updates the post's status, publishId, and publishedAt", async () => {
    const { firestore, updateSpy } = makeMockFirestore();
    await markPostPublished("abc", "v_pub_url~123", firestore);

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "published", publishId: "v_pub_url~123" }),
    );
  });
});

describe("markPostFailed", () => {
  it("updates the post's status and error message", async () => {
    const { firestore, updateSpy } = makeMockFirestore();
    await markPostFailed("abc", "TikTok API returned status 401", firestore);

    expect(updateSpy).toHaveBeenCalledWith({ status: "failed", error: "TikTok API returned status 401" });
  });
});
