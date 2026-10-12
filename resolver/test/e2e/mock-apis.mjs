// Local stand-in for the YouTube Data API and Kimi chat completions, for end-to-end agent tests.
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/youtube/v3/videos") {
    const ids = (url.searchParams.get("id") ?? "").split(",").filter(Boolean);
    const items = ids.map((id) => ({
      id,
      snippet: { title: `Mock video ${id}`, channelTitle: "Mock Channel", channelId: "UCmockchannel0000000000", publishedAt: new Date(Date.now() - 3 * 3.6e6).toISOString() },
      statistics: { viewCount: "1700000000", likeCount: "17000000", commentCount: "2000000" },
    }));
    return res.end(JSON.stringify({ items }));
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
