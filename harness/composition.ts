// The two compositions a native run deploys. The Convex CLI reads convex.json and package.json from
// its working directory and takes no functions directory any other way, so a composition is a
// name, the project directory the CLI runs in and the functions directory that project's
// convex.json names. Both directories are relative to the repository root.
import { join } from "node:path";
export interface Composition {
  name: "fixture" | "production";
  project: string;
  functions: string;
  installedLayers: readonly string[];
}
export const fixtureComposition: Composition = {
  name: "fixture",
  project: ".",
  functions: "fixture/convex",
  installedLayers: [],
};
// The example application, with no test-only function registered.
export const productionComposition: Composition = {
  name: "production",
  project: "example",
  functions: "example/convex",
  installedLayers: [],
};
export const compositions: readonly Composition[] = [
  fixtureComposition,
  productionComposition,
];
const repositoryRoot = join(import.meta.dirname, "..");
export function projectDirectory(composition: Composition): string {
  return join(repositoryRoot, composition.project);
}
function named(name: string): Composition {
  const found = compositions.find((composition) => composition.name === name);
  if (found === undefined)
    throw new Error(
      `No composition is named "${name}". The compositions are ${compositions.map((composition) => composition.name).join(" and ")}.`,
    );
  return found;
}
// The compositions a script's arguments name, each once and in the order given. No argument names
// every composition.
export function compositionsNamed(args: readonly string[]): Composition[] {
  if (args.length === 0) return [...compositions];
  return [...new Set(args)].map(named);
}
// The one composition a script's arguments name. No argument names the fixture composition.
export function compositionNamed(args: readonly string[]): Composition {
  if (args.length > 1)
    throw new Error(
      `Name one composition, not ${args.length}: ${args.join(", ")}.`,
    );
  return args[0] === undefined ? fixtureComposition : named(args[0]);
}
