import { planScenes, buildScenePrompt } from "./src/lib/video/planner.server";
import { getVideoProvider } from "./src/lib/video/provider.server";
import { concatMp4, probeMp4 } from "./src/lib/video/mp4.server";

const provider = getVideoProvider();
const plan = await planScenes({
  prompt: "A lone astronaut walks across a red desert toward a crashed satellite at sunset",
  style: "Cinematic",
  aspectRatio: "16:9",
  sceneSeconds: [4, 4],
});
console.log("BIBLE:", plan.continuityBible.slice(0, 200));
plan.scenes.forEach((s) => console.log(`SCENE ${s.index} (${s.seconds}s) ${s.title}: ${s.prompt.slice(0, 120)}...`));

const clips: Uint8Array[] = [];
for (const scene of plan.scenes) {
  const job = await provider.createClip({
    prompt: buildScenePrompt({
      originalPrompt: "A lone astronaut walks across a red desert toward a crashed satellite at sunset",
      continuityBible: plan.continuityBible,
      scene,
      sceneCount: plan.scenes.length,
      style: "Cinematic",
      aspectRatio: "16:9",
      previousScene: scene.index > 1 ? plan.scenes[scene.index - 2]! : null,
    }),
    seconds: scene.seconds,
    aspectRatio: "16:9",
  });
  console.log("clip job", scene.index, job.id, job.status);
  let state = job;
  while (state.status !== "completed" && state.status !== "failed") {
    await new Promise((r) => setTimeout(r, 8000));
    state = await provider.getClip(job.id);
    console.log("  ", state.status, state.progress);
  }
  if (state.status === "failed") throw new Error(state.error ?? "failed");
  const bytes = await provider.downloadClip(job.id);
  console.log("  downloaded", bytes.byteLength, "bytes; probe:", JSON.stringify(probeMp4(bytes)));
  clips.push(bytes);
}

const out = concatMp4(clips);
console.log("STITCHED:", JSON.stringify(out.probe));
await Bun.write("/tmp/stitched.mp4", out.data);
