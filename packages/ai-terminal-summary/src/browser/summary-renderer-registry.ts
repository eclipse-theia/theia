import { injectable } from '@theia/core/shared/inversify';
import { Disposable, Emitter, Event } from '@theia/core/shared/vscode-languageserver-protocol';

export const SummaryRendererRegistry = Symbol('SummaryRendererRegistry');

export interface SummaryRendererRegistry {
    renderers: Set<React.FunctionComponent<any>>;
    registerRenderer(renderer: React.FunctionComponent<any>): void;
    onDidChange: Event<void>;
}

@injectable()
export class SummaryRendererRegistryImpl implements SummaryRendererRegistry {

    protected readonly _renderers = new Set<React.FunctionComponent<any>>();
    readonly renderers: Set<React.FunctionComponent<any>> = this._renderers;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    registerRenderer(renderer: React.FunctionComponent<any>): Disposable {
        this._renderers.add(renderer);
        this.onDidChangeEmitter.fire();
        return Disposable.create(() => {
            this._renderers.delete(renderer);
            this.onDidChangeEmitter.fire();
        });
    }

}
