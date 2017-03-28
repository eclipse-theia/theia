import { Emitter, Event } from '../common/event';
import { injectable } from "inversify";

export type SelectionListener = (newSelection: any) => void;

export interface SelectionProvider<T> {
    onSelectionChanged: Event<T | undefined>;
}

@injectable()
export class SelectionService implements SelectionProvider<any> {

    constructor() { }

    private currentSelection: any;
    private selectionListeners: Emitter<any> = new Emitter();

    get selection(): any {
        return this.currentSelection;
    }

    set selection(selection: any) {
        this.currentSelection = selection;
        this.selectionListeners.fire(this.currentSelection);
    }

    get onSelectionChanged(): Event<any> {
        return this.selectionListeners.event;
    }
}
