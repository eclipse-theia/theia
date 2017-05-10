import { Emitter, Event } from "../application/common";


export class PreferenceService {
    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChangeEvent>();

    protected readonly preferences = new Map<string, Preference>();

    protected firePreferenceChanged(pref: PreferenceChangeEvent) {
        this.onPreferenceChangedEmitter.fire(pref);
    }

    get onPreferenceChanged(): Event<any> {
        return this.onPreferenceChangedEmitter.event;
    }

    get preferenceNames(): IterableIterator<string> {
        return this.preferences.keys();
    }

    /**
     * Get preference by key if it exists, return undefined if not
     * @param key Unique preference string identifier
     */
    getPref(key: string): Preference | undefined {

        let pref: Preference | undefined = this.preferences.get(key);
        return pref !== undefined ? pref : undefined;
    }

    /**
     * Updates a pref and fires an appropriate event for it
     * @param pref The new preference
     */
    setPref(pref: Preference) {
        let oldPref = this.preferences.get(pref.key);
        this.preferences.set(pref.key, pref);
        let change: PreferenceChangeEvent = new PreferenceChangeEvent(pref, oldPref);
        this.firePreferenceChanged(change);
    }

    removePref(pref: Preference): Preference | undefined {
        let latestPref = this.getPref(pref.key);
        if (latestPref !== undefined) {
            if (this.preferences.delete(pref.key)) {
                return latestPref;
            }
        }
        return undefined;
    }
}

export class Preference {
    constructor(public key: string, public value: any) { }
}

export class PreferenceChangeEvent {
    constructor(
        public readonly pref: Preference,
        public readonly oldPref: Preference | undefined
    ) { }
}