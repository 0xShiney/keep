#!/usr/bin/env node
/**
 * Resolves the digest for every production image and rewrites deploy/images.lock.json.
 *
 * Uses the OCI distribution API directly, so no Docker daemon or registry login is
 * needed for public images. After running this, update deploy/compose.yaml and
 * deploy/caddy/Dockerfile with the printed digests (kept explicit so a diff shows
 * exactly which image changed).
 *
 * Usage: node scripts/pin-images.mjs
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const IMAGES = [
  { key: "forgejo", registry: "code.forgejo.org", repo: "forgejo/forgejo", tag: "15.0.12" },
  {
    key: "postgres",
    registry: "registry-1.docker.io",
    repo: "library/postgres",
    tag: "16.10-alpine",
  },
  { key: "caddy", registry: "registry-1.docker.io", repo: "library/caddy", tag: "2.10.2-alpine" },
  { key: "restic", registry: "registry-1.docker.io", repo: "restic/restic", tag: "0.18.0" },
];

const ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

async function tokenFor(image) {
  const scope = `repository:${image.repo}:pull`;
  if (image.registry === "registry-1.docker.io") {
    const url = `https://auth.docker.io/token?service=registry.docker.io&scope=${scope}`;
    const body = await (await fetch(url)).json();
    if (!body.token) throw new Error(`no token for ${image.repo}`);
    return body.token;
  }
  const url = `https://${image.registry}/v2/token?service=container_registry&scope=${scope}`;
  const body = await (await fetch(url)).json();
  if (!body.token) throw new Error(`no token for ${image.repo}`);
  return body.token;
}

async function digestFor(image) {
  const token = await tokenFor(image);
  const url = `https://${image.registry}/v2/${image.repo}/manifests/${image.tag}`;
  const response = await fetch(url, {
    method: "HEAD",
    headers: { authorization: `Bearer ${token}`, accept: ACCEPT },
  });
  if (!response.ok)
    throw new Error(`${image.registry}/${image.repo}:${image.tag} -> HTTP ${response.status}`);
  const digest = response.headers.get("docker-content-digest");
  if (!digest?.startsWith("sha256:")) throw new Error(`no digest for ${image.repo}:${image.tag}`);
  return { digest, url };
}

const images = {};
for (const image of IMAGES) {
  const { digest, url } = await digestFor(image);
  const ref =
    image.registry === "registry-1.docker.io"
      ? `${image.repo.replace(/^library\//, "")}:${image.tag}`
      : `${image.registry}/${image.repo}:${image.tag}`;
  images[image.key] = { ref, digest, source: url };
  console.log(`${ref}\n  ${digest}`);
}

const lock = {
  $comment: `Resolved ${new Date().toISOString().slice(0, 10)} from the registries' distribution APIs. Re-run scripts/pin-images.mjs after a deliberate upgrade.`,
  images,
};
const target = path.join(process.cwd(), "deploy/images.lock.json");
await writeFile(target, `${JSON.stringify(lock, null, 2)}\n`);
console.log(`\nWrote ${target}. Update compose.yaml + caddy/Dockerfile with these digests.`);
