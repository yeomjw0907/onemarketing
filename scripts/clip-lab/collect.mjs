import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { atomicJson, youtubeUrl } from "./core.mjs";

export const seedChannels = [
  ["@bayashiTV_", "음식"],
  ["@ZachChoi", "음식"],
  ["@NickDiGiovanni", "음식"],
  ["@JoshuaWeissman", "음식"],
  ["@albert_cancook", "음식"],
  ["@ChefRush", "음식"],
  ["@GugaFoods", "음식"],
  ["@Andy_Cooks", "음식"],
  ["@tasty", "음식"],
  ["@Tastemade", "음식"],
  ["@foodnetwork", "음식"],
  ["@bonappetit", "음식"],
  ["@epicurious", "음식"],
  ["@Maangchi", "음식"],
  ["@AaronandClaire", "음식"],
  ["@MadeWithLau", "음식"],
  ["@MKBHD", "제품"],
  ["@UnboxTherapy", "제품"],
  ["@Mrwhosetheboss", "제품"],
  ["@Samsung", "제품"],
  ["@SamsungUS", "제품"],
  ["@Apple", "제품"],
  ["@Dyson", "제품"],
  ["@IKEA", "생활"],
  ["@LEGO", "제품"],
  ["@Sephora", "뷰티"],
  ["@Nespresso", "커피"],
  ["@Starbucks", "커피"],
  ["@JamesHoffmann", "커피"],
  ["@LanceHedrick", "커피"],
  ["@morganDrinksCoffee", "커피"],
  ["@Cafict", "커피"],
  ["@CleanThatUp", "생활"],
  ["@Aurikatariina", "생활"],
  ["@TheSorryGirls", "생활"],
  ["@AlexandraGater", "생활"],
  ["@Nike", "광고"],
  ["@adidas", "광고"],
  ["@redbull", "광고"],
  ["@GoPro", "광고"],
  ["@DanielSchiffer", "광고"],
  ["@PeterMcKinnon", "광고"],
  ["@ChrisHau", "광고"],
  ["@HaylsWorld", "제품"],
  ["@SafiyaNygaard", "뷰티"],
  ["@Hyram", "뷰티"],
  ["@DrDrayzday", "뷰티"],
  ["@MixedMakeup", "뷰티"],
  ["@BeautyWithin", "뷰티"],
  ["@LabMuffinBeautyScience", "뷰티"],
];
function flatChannel(executable, url, cap) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "--flat-playlist",
        "--dump-single-json",
        "--playlist-end",
        String(cap),
        "--skip-download",
        "--no-warnings",
        "--socket-timeout",
        "20",
        url,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (out.length > 12e6) child.kill();
    });
    child.stderr.on("data", (d) => (err = (err + d).slice(-1000)));
    const timer = setTimeout(() => child.kill(), 90000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(err || "channel unavailable"));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error("invalid channel metadata"));
      }
    });
  });
}
export async function collectReferences({
  executable,
  root,
  excluded = [],
  target = 1000,
  cap = 60,
  onProgress = () => {},
}) {
  await mkdir(path.join(root, "discovery"), { recursive: true });
  const groups = [];
  const excludedIds = new Set(
    excluded.map((u) => new URL(youtubeUrl(u)).searchParams.get("v")),
  );
  for (const [handle, category] of seedChannels) {
    const url = "https://www.youtube.com/" + handle + "/shorts";
    const file = path.join(root, "discovery", handle.slice(1) + ".json");
    let data;
    try {
      data = JSON.parse(await readFile(file, "utf8"));
    } catch {
      try {
        const result = await flatChannel(executable, url, cap);
        data = {
          url,
          category,
          channel: result.channel || result.title,
          channelId: result.channel_id,
          checkedAt: new Date().toISOString(),
          entries: (result.entries || [])
            .filter((e) => /^[A-Za-z0-9_-]{11}$/.test(e.id))
            .map((e) => ({
              id: e.id,
              title: e.title || e.id,
              url: "https://www.youtube.com/watch?v=" + e.id,
              durationSeconds: e.duration ?? null,
              viewCount: e.view_count ?? null,
            })),
        };
      } catch {
        data = {
          url,
          category,
          entries: [],
          error: "SHORTS_TAB_UNAVAILABLE",
          checkedAt: new Date().toISOString(),
        };
      }
      await atomicJson(file, data);
    }
    if (data.entries.length) groups.push(data);
    onProgress({ handle, found: data.entries.length, channels: groups.length });
  }
  const refs = [],
    seen = new Set(excludedIds);
  for (let i = 0; i < cap && refs.length < target; i++)
    for (const group of groups) {
      const e = group.entries[i];
      if (!e || seen.has(e.id)) continue;
      seen.add(e.id);
      refs.push({
        ...e,
        category: group.category,
        discoverySource: group.url,
        channel: group.channel,
        channelId: group.channelId,
        metadata: {
          title: e.title,
          author: group.channel,
          status: 200,
          checkedAt: group.checkedAt,
        },
        selectionBasis: "public-shorts-tab, round-robin across channels",
      });
      if (refs.length === target) break;
    }
  const manifest = {
    name: "클립 연구소 추가 1000개 연구",
    selection:
      "공개 채널 Shorts 탭에서 채널 간 순환 표집. 기존 30개 제외. 성과 순위나 무작위 표본이 아님.",
    createdAt: new Date().toISOString(),
    target,
    collected: refs.length,
    channels: groups.length,
    references: refs,
  };
  await atomicJson(path.join(root, "manifest.json"), manifest);
  return manifest;
}
if (
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const excluded = process.env.CLIP_LAB_EXCLUDE
    ? JSON.parse(
        await readFile(process.env.CLIP_LAB_EXCLUDE, "utf8"),
      ).references.map((r) => r.url)
    : [];
  const manifest = await collectReferences({
    executable: process.env.YTDLP_PATH || "yt-dlp",
    root: path.resolve(process.env.CLIP_LAB_DATA_DIR || "output/clip-lab-1000"),
    excluded,
    onProgress: (p) => console.log(JSON.stringify(p)),
  });
  console.log(
    JSON.stringify({
      collected: manifest.collected,
      channels: manifest.channels,
    }),
  );
}
