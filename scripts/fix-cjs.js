#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            await walk(p);
            continue;
        }

        if (e.isFile()) {
            // Rename JS -> CJS and update source map references
            if (e.name.endsWith('.js')) {
                const newPath = p.slice(0, -3) + '.cjs';
                await fs.rename(p, newPath);

                // Rename source map if present (index.js.map -> index.cjs.map)
                const mapOld = p + '.map';
                const mapNew = newPath + '.map';
                try {
                    await fs.rename(mapOld, mapNew);
                } catch (err) {
                    // ignore if no map
                }

                // Fix sourceMappingURL comment inside the renamed file
                try {
                    let contents = await fs.readFile(newPath, 'utf8');
                    contents = contents.replace(/sourceMappingURL=([^\n\r]+)/, `sourceMappingURL=${path.basename(mapNew)}`);
                    await fs.writeFile(newPath, contents, 'utf8');
                } catch (err) {
                    // ignore read/write errors
                }
            }

            // Rename type declaration extension .d.ts -> .d.cts
            if (e.name.endsWith('.d.ts')) {
                const newPath = p.slice(0, -5) + '.d.cts';
                await fs.rename(p, newPath);
            }
        }
    }
}

(async function main() {
    try {
        const dist = path.resolve('dist', 'cjs');
        await walk(dist);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
