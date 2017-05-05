import { injectable } from "inversify";



// export interface IPreferenceService {
//     sub(key: String, callback: Function): void;
//     unsub(key: String, callback: Function): void;
//     set(key: String, value: any): Boolean;
//     get(key: String): any;
//     notify(key: String): Boolean;
//     // testInjection(): void;
// }

export const IPreferenceService = Symbol("IPreferenceService");


@injectable()
// export class PreferenceService implements IPreferenceService {
export class PreferenceService {

    static prefs: Map<String, any>;
    static listeners: Map<String, Function[]>;

    public static sub(key: String, callback: Function): void {
        console.log("subbing to: " + key);
        let callbacks: Function[] | undefined = this.listeners.get(key);
        if (callbacks !== undefined) {
            if (callbacks.some(cb => cb === callback)) {
                return;
            } else {
                callbacks.push(callback);
            }
        } else {
            callbacks = [callback];
        }
        this.listeners.set(key, callbacks);
    }

    public static unsub(key: String, callback: Function): void {
        console.log("unsubbing to: " + key);
        let callbacks: Function[] | undefined = this.listeners.get(key);
        if (callbacks !== undefined) {
            if (callbacks.some(cb => cb === callback)) {
                let idx: number = callbacks.indexOf(callback);
                if (idx !== -1) {
                    callbacks.splice(idx, 1);

                    this.listeners.set(key, callbacks);
                }
            }
        }
    }

    static set(key: String, value: any): Boolean {
        if (this.prefs.get(key) !== undefined) {
            this.prefs.set(key, value);

            this.notify(key);
            return true;
        } else {
            return false;
        }


    }

    static get(key: String): any {
        return this.prefs.get(key);
    }


    // testInjection(): void;


    // public static sub(pref: Preference, sub: IPreferenceListener): void {
    //     console.log("subbing");
    // }
    // public unsub(pref: Preference, sub: IPreferenceListener): void {
    //     console.log("unsubbing");
    // }

    // publish(pref: Preference): void {
    //     console.log("publishing an event");
    // }

    // testInjection(): void {
    //     console.log("injecting test");
    //     alert('test');
    // }

    static notify(key: String) {
        let callbacks = this.listeners.get(key);
        if (callbacks !== undefined) {
            callbacks.forEach((func: Function) => {
                func();
            });
            return true;
        } else {
            return false;
        }
    }
}

export class Preference {
    key: String;
    value: any;
}

// export interface Map<String> {
//     [ any: String]: String;
// }

/**
 * Interface that clients must implements
 */
export interface IPreferenceListener {
    inform(event: IPreferenceEvent): void
}

export interface IPreferenceEvent {
    prefSection: string;
    prefsChanged: Preference[];
}


