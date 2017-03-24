import { Emitter, Event } from '../common';
import { injectable } from "inversify";

export type SelectionListener = (newSelection: any) => void;

@injectable()
export class SelectionService {

    constructor() { }

    private currentSelection: any;
    private selectionListeners: Emitter<any> = new Emitter();

    public setSelection(selection: any) {
        this.currentSelection = selection;
        this.selectionListeners.fire(this.currentSelection);
    }

    get onSelectionChanged(): Event<any> {
        return this.selectionListeners.event;
    }
}
