import * as path from "path";
import { injectable } from "inversify";
import {
    BaseLanguageClient,
    Executable,
    NodeConnectionProvider
} from 'vscode-languageclient/lib/nodeConnection';
import { LanguageContributor } from "../../languages/node";

export type ConfigurationType = 'config_win' | 'config_mac' | 'config_linux';
export const configurations = new Map<typeof process.platform, ConfigurationType>();
configurations.set('darwin', 'config_mac');
configurations.set('win32', 'config_win');
configurations.set('linux', 'config_linux');

@injectable()
export class JavaContributor implements LanguageContributor {

    createLanguageClient(services: BaseLanguageClient.IServices): BaseLanguageClient {
        const projectPath = path.resolve(__dirname, '../../..');
        const serverPath = path.resolve(projectPath, '../eclipse.jdt.ls/org.eclipse.jdt.ls.product/target/repository');
        const jarPath = path.resolve(serverPath, 'plugins/org.eclipse.equinox.launcher_1.4.0.v20161219-1356.jar');
        const workspacePath = path.resolve(projectPath, '../../ws');
        const configuration = configurations.get(process.platform);
        const configurationPath = path.resolve(serverPath, configuration);
        const run: Executable = {
            command: 'java',
            args: [
                '-Declipse.application=org.eclipse.jdt.ls.core.id1',
                '-Dosgi.bundles.defaultStartLevel=4',
                '-Declipse.product=org.eclipse.jdt.ls.core.product',
                '-Dlog.protocol=true',
                '-Dlog.level=ALL',
                '-noverify',
                '-Xmx1G',
                '-jar', jarPath,
                '-configuration', configurationPath,
                '-data', workspacePath
            ]
        };
        /*const debug: Executable = {
            ...run,
            args: [
                '-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5009'
            ].concat(run.args!)
        }
        const serverOptions = {run, debug};*/
        const serverOptions = run;
        const workspace = services.workspace;
        const fileEvents = [];
        if (workspace.createFileSystemWatcher) {
            fileEvents.push(workspace.createFileSystemWatcher("**/*.java"));
            fileEvents.push(workspace.createFileSystemWatcher("**/pom.xml"));
            fileEvents.push(workspace.createFileSystemWatcher("**/*.gradle"));
        }
        return new BaseLanguageClient({
            name: 'Java Language Client',
            clientOptions: {
                documentSelector: ['java'],
                synchronize: {
                    configurationSection: 'java',
                    fileEvents
                }
            },
            services,
            connectionProvider: new NodeConnectionProvider({
                serverOptions,
                workspace
            })
        });
    }

}
