import fs from "node:fs";
import path from "node:path";

const testDataRoot = path.resolve(process.cwd(), ".test-data");
const vaultRoot = path.join(testDataRoot, "e2e-vault");

if (path.basename(testDataRoot) !== ".test-data") {
  throw new Error(`Refusing to clean unexpected test path: ${testDataRoot}`);
}

fs.rmSync(vaultRoot, { recursive: true, force: true });
fs.mkdirSync(vaultRoot, { recursive: true });
