import { injectable } from "inversify";
import { LanguageContribution, IConnection, createServerProcess, forward } from "../../node";

export type ConfigurationType = 'config_win' | 'config_mac' | 'config_linux';
export const configurations = new Map<typeof process.platform, ConfigurationType>();
configurations.set('darwin', 'config_mac');
configurations.set('win32', 'config_win');
configurations.set('linux', 'config_linux');


/**
 * IF you have python on your machine, `pyls` can be installed with the following command:
 * `pip install `
 */
@injectable()
export class PythonContribution implements LanguageContribution {

    readonly description = {
        id: 'python',
        name: 'Python',
        documentSelector: ['python'],
        fileEvents: [
            '**/*.py'
        ]
    }

    listen(clientConnection: IConnection): void {
        const command = 'pyls';
        const args: string[] = [
        ];
        const serverConnection = createServerProcess(this.description.name, command, args);
        forward(clientConnection, serverConnection);
    }

}
