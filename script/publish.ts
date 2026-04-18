#!/usr/bin/env bun
import { $ } from "bun"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const env = {
  CHANNEL: process.env["CHANNEL"],
  BUMP: process.env["BUMP"],
  VERSION: process.env["VERSION"],
}

const CHANNEL = await (async () => {
  if (env.CHANNEL) return env.CHANNEL
  if (env.BUMP) return "latest"
  if (env.VERSION && !env.VERSION.startsWith("0.0.0-")) return "latest"
  const branch = process.env["GITHUB_REF_NAME"] || (await $`git branch --show-current`.text().then((x) => x.trim()))
  return branch === "main" || branch === "master" ? "latest" : branch
})()

const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.VERSION) return env.VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  
  const pkg = await import("../package.json").then((m) => m.default)
  const version = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`)
    .then((res) => {
      if (!res.ok) return "0.0.0"
      return res.json().then((data) => data.version)
    })
    .catch(() => "0.0.0")

  const [major, minor, patch] = version.split(".").map((x) => Number(x) || 0)
  const t = env.BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

async function publishTarball() {
  const result = await $`npm publish *.tgz --tag ${CHANNEL} --access public`.nothrow()
  if (result.exitCode === 0) return

  const stderr = result.stderr.toString()
  if (stderr.includes("previously published versions")) {
    console.log("Skipping already-published plugin package")
    return
  }

  throw new Error(stderr || "npm publish failed")
}

await $`bun tsc`
const pkg = await import("../package.json").then((m) => m.default)
const original = JSON.parse(JSON.stringify(pkg))
pkg.version = VERSION
for (const [key, value] of Object.entries(pkg.exports)) {
  const file = value.replace("./src/", "./dist/").replace(".ts", "")
  // @ts-ignore
  pkg.exports[key] = {
    import: file + ".js",
    types: file + ".d.ts",
  }
}
await Bun.write("package.json", JSON.stringify(pkg, null, 2))
await $`bun pm pack`
await publishTarball()
await Bun.write("package.json", JSON.stringify(original, null, 2))
