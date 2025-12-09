import path = require('path');
import { GeneralShellType, guessShellTypeFromExecutable } from '../common/shell-type';
import { ShellProcess, ShellProcessOptions } from './shell-process';

export class ShellIntegrationInjector {

    static bashFlag = '--rcfile';
    static bashIntegrationScript = 'bash/bash-integration.bash';
    static IntegrationPath = 'shell-integrations';
    static ZshIntegration = 'THEIA_ZSH_DIR';
    static ZshIntegrationPath = 'zsh';
    static ZDOTDIR = 'ZDOTDIR';
    static ZDOTDIRPath = '/zsh/zdotdir/';

    private static getShellIntegrationPath(relativePath: string): string {
        // Use __dirname which points to lib/node/ in production
        return path.join(__dirname, 'shell-integrations', relativePath);
    }

    static injectShellIntegration(options: ShellProcessOptions): ShellProcessOptions {
        const shellExecutable = options.shell ?? ShellProcess.getShellExecutablePath();
        const shellType = guessShellTypeFromExecutable(shellExecutable);
        if (shellType === GeneralShellType.Bash) {
            // strips the login flag if present to avoid conflicts with --rcfile
            return {
                ...options,
                args: [
                    this.bashFlag, this.getShellIntegrationPath(this.bashIntegrationScript)
                ],
            };
        } else if (shellType === GeneralShellType.Zsh) {
            const zdotdirPath = this.getShellIntegrationPath('zsh/zdotdir/');
            const zshDirPath = this.getShellIntegrationPath(this.ZshIntegrationPath);

            return {
                ...options,
                env: {
                    ...options.env,
                    [this.ZDOTDIR]: zdotdirPath,
                    [this.ZshIntegration]: zshDirPath,
                },
            };
        } else {
            return options;
        }
    }

}
