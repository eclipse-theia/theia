/**
 * Get the workspace root from the process' arguments.
 */
export function getWorkspaceRoot(): string {
        const rootDirFlagIndex = process.argv.indexOf('--theia-root-dir');
        if (rootDirFlagIndex == -1) {
                throw new Error('--theia-root-dir argument not specified.');
        }

        const rootDirValIndex = rootDirFlagIndex + 1;
        if (rootDirFlagIndex >= process.argv.length) {
                throw new Error('Missing argument to --theia-root-dir');
        }

        return process.argv[rootDirValIndex];
}
