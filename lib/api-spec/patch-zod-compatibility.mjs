import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedPath = path.join(root, "api-zod", "src", "generated", "api.ts");
const indexPath = path.join(root, "api-zod", "src", "index.ts");
let source = await readFile(generatedPath, "utf8");

const generatedImport = "import * as zod from 'zod';";
const compatibilityImport = `import * as zodImport from 'zod';

const zod = Object.assign(zodImport, {
  int: () => zodImport.number().int(),
  email: () => zodImport.string().email(),
});`;

if (source.includes(generatedImport)) {
  source = source.replace(generatedImport, compatibilityImport);
}

await writeFile(generatedPath, source);

let indexSource = await readFile(indexPath, "utf8");
indexSource = indexSource.replace(/\nexport \* from ['"]\.\/generated\/types['"];\s*$/m, "\n");
await writeFile(indexPath, indexSource);