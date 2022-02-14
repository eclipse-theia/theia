const fs = require('fs').promises;

const [input, output] = process.argv.slice(2);

(async function () {
    const content = await fs.readFile(input, 'utf-8');

    const files = new Set();

    for (const line of content.split('\n')) {
        if (line.startsWith('packages')) {
            const index = line.indexOf('(');
            if (index !== -1) {
                files.add(line.substring(0, index));
            }
        }
    }

    await fs.writeFile(output, Array.from(files).join('\n'));
})();
