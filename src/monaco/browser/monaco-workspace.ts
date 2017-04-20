import { injectable, inject, decorate } from "inversify";
import { MonacoWorkspace as BaseMonacoWorkspace, MonacoToProtocolConverter, testGlob } from "monaco-languageclient";
import { DisposableCollection } from "../../application/common";
import { FileChangeType, FileSystem, Path } from '../../filesystem/common';
import * as lang from "../../languages/common";
import { Workspace, FileSystemWatcher, Emitter, FileEvent } from "../../languages/common";

decorate(injectable(), BaseMonacoWorkspace);
decorate(inject(MonacoToProtocolConverter), BaseMonacoWorkspace, 0);

@injectable()
export class MonacoWorkspace extends BaseMonacoWorkspace implements Workspace {
    protected resolveReady: () => void;
    readonly ready = new Promise<void>(resolve => {
        this.resolveReady = resolve;
    });

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(MonacoToProtocolConverter) m2p: MonacoToProtocolConverter
    ) {
        super(m2p);
        fileSystem.toUri(Path.ROOT).then(rootUri => {
            this._rootUri = rootUri;
            this.resolveReady();
        });
    }

    createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher {
        const disposables = new DisposableCollection()
        const onFileEventEmitter = new Emitter<FileEvent>()
        disposables.push(onFileEventEmitter);
        disposables.push(this.fileSystem.watch(event => {
            for (const change of event.changes) {
                const result: [lang.FileChangeType, boolean | undefined] =
                    change.type === FileChangeType.ADDED ? [lang.FileChangeType.Created, ignoreCreateEvents] :
                        change.type === FileChangeType.UPDATED ? [lang.FileChangeType.Changed, ignoreChangeEvents] :
                            [lang.FileChangeType.Deleted, ignoreDeleteEvents];

                const type = result[0];
                const ignoreEvents = result[1];
                const path = change.path;
                if (ignoreEvents === undefined && ignoreEvents === false && testGlob(globPattern, path.toString())) {
                    this.fileSystem.toUri(path).then(uri => {
                        if (uri) {
                            onFileEventEmitter.fire({ uri, type });
                        }
                    });
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
