import { injectable, inject, decorate } from "inversify";
import { MonacoWorkspace as BaseMonacoWorkspace, MonacoToProtocolConverter, testGlob } from "monaco-languageclient";
import { DisposableCollection } from "../../application/common";
import { FileChangeType, FileSystem2, FileSystemWatcher } from '../../filesystem/common';
import * as lang from "../../languages/common";
import * as protocol from "../../languages/common";

decorate(injectable(), BaseMonacoWorkspace);
decorate(inject(MonacoToProtocolConverter), BaseMonacoWorkspace, 0);

@injectable()
export class MonacoWorkspace extends BaseMonacoWorkspace implements protocol.Workspace {
    protected resolveReady: () => void;
    readonly ready = new Promise<void>(resolve => {
        this.resolveReady = resolve;
    });

    constructor(
        @inject(FileSystem2) protected readonly fileSystem: FileSystem2,
        @inject(FileSystemWatcher) protected readonly fileSystemWatcher: FileSystemWatcher,
        @inject(MonacoToProtocolConverter) m2p: MonacoToProtocolConverter
    ) {
        super(m2p);
        fileSystem.getWorkspaceRoot().then(rootStat => {
            this._rootUri = rootStat.uri;
            this.resolveReady();
        });
    }

    createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): protocol.FileSystemWatcher {
        const disposables = new DisposableCollection()
        const onFileEventEmitter = new protocol.Emitter<protocol.FileEvent>()
        disposables.push(onFileEventEmitter);
        disposables.push(this.fileSystemWatcher.onFileChanges(event => {
            for (const change of event.changes) {
                const result: [lang.FileChangeType, boolean | undefined] =
                    change.type === FileChangeType.ADDED ? [lang.FileChangeType.Created, ignoreCreateEvents] :
                        change.type === FileChangeType.UPDATED ? [lang.FileChangeType.Changed, ignoreChangeEvents] :
                            [lang.FileChangeType.Deleted, ignoreDeleteEvents];

                const type = result[0];
                const ignoreEvents = result[1];
                const uri = change.uri;
                if (ignoreEvents === undefined && ignoreEvents === false && testGlob(globPattern, uri)) {
                    onFileEventEmitter.fire({ uri, type });
                }
            }
        }));
        const onFileEvent = onFileEventEmitter.event;
        return {
            onFileEvent,
            dispose: () => disposables.dispose()
        };
    }

}
