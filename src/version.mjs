import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

export const VERSION = packageJson.version;
