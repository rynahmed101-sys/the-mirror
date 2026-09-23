import test from "node:test";
import assert from "node:assert/strict";
import { LAB_PLUGINS, LAB_WORKFLOW, listLabPlugins, selectLabPlugins } from "../src/lib/lab/plugins";

test("laboratory registry exposes first-class plugins and ordered workflow", () => {
  assert.ok(LAB_PLUGINS.length >= 5);
  assert.deepEqual(LAB_WORKFLOW, ["observe","retrieve_knowledge","think","visualize","challenge","act","record","evaluate"]);
  assert.ok(listLabPlugins().every((plugin) => plugin.id && plugin.name && plugin.category));
});

test("explicit plugin selection rejects unknown ids", () => {
  assert.throws(() => selectLabPlugins(["not-a-plugin"]), /do not exist/);
});

test("all selection excludes nothing marked unsupported", () => {
  const all = selectLabPlugins();
  assert.ok(all.every((plugin) => plugin.supportsAll));
});

test("perturbation plugin is explicitly separated from brain architecture", () => {
  const perturbation = listLabPlugins().find((plugin) => plugin.id === "perturbation-96");
  assert.ok(perturbation);
  assert.match(perturbation!.description, /not the separate 96-node brain/);
});
