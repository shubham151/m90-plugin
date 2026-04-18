#!/usr/bin/env bun
import { Script } from "@spidermines/m90-script"
import { $ } from "bun"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

async function publishTarball() {
  const result = await $`npm publish *.tgz --tag ${Script.channel} --access public`.nothrow()
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
