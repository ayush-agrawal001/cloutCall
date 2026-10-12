// Local stand-in for the YouTube Data API and Kimi chat completions, for end-to-end agent tests.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/youtube/v3/videos") {
    // Trending chart: three "fresh" uploads. Views grow over time so pace panels have something to show.
    const fresh = ["aqz-KE-bpKQ", "jNQXAC9IVRw", "M7lc1UVf-VE"];
    const ids = url.searchParams.get("chart") ? fresh : (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
    const grow = Math.floor((Date.now() / 1000) % 100000) * 37;
    const items = ids.map((id) => ({
      id,
      snippet: { title: `Mock video ${id}`, channelTitle: "Mock Channel", channelId: "UCmockchannel0000000000", publishedAt: new Date(Date.now() - (fresh.includes(id) ? 2 : 3) * 3.6e6).toISOString() },
      statistics: { viewCount: String(fresh.includes(id) ? 400000 + grow : 1700000000), likeCount: "17000", commentCount: "2000" },
    }));
    return res.end(JSON.stringify({ items }));
  }
  if (url.pathname === "/youtube/v3/channels") {
    return res.end(JSON.stringify({ items: [{ id: "UCmockchannel0000000000", contentDetails: { relatedPlaylists: { uploads: "UUmockuploads" } } }] }));
  }
  if (url.pathname === "/youtube/v3/playlistItems") {
    return res.end(JSON.stringify({ items: ["aqz-KE-bpKQ", "jNQXAC9IVRw"].map((videoId) => ({ contentDetails: { videoId } })) }));
  }
  if (url.pathname === "/v1/chat/completions") {
    return res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ side: "YES", confidence: 74, predictedViews: 1702500000, reasoning: "Mock: pace of 566k/h clears the gap." }) } }],
      }),
    );
  }
  res.statusCode = 404;
  res.end("{}");
}).listen(port, () => console.log(`mock APIs on :${port}`));
