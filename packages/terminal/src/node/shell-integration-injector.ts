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
    static ZDOTDIRPath = '/zsh/ZDOTDIR/';

    static injectShellIntegration(options: ShellProcessOptions): ShellProcessOptions {
        const shellType = guessShellTypeFromExecutable(options.shell ?? ShellProcess.getShellExecutablePath());
        if (shellType === GeneralShellType.Bash) {
            // strips the login flag if present to avoid conflicts with --rcfile
            return {
                ...options,
                args: [
                    this.bashFlag, path.join(__dirname, this.IntegrationPath, this.bashIntegrationScript)
                ],
            };
        } else if (shellType === GeneralShellType.Zsh) {
            return {
                ...options,
                env: {
                    [this.ZDOTDIR]: path.join(__dirname, this.IntegrationPath, this.ZDOTDIRPath),
                    [this.ZshIntegration]: path.join(__dirname, this.IntegrationPath, this.ZshIntegrationPath),
                },
            };
        } else {
            return options;
        }
    }

}
