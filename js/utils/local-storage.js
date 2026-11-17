/*
	localStorage access that never throws. Storage can be blocked (site data disabled, some private windows)
	or full; the app then keeps working, it just doesn't remember things.
*/

export function readJson(storageKey) {
	try {
		return JSON.parse(readItem(storageKey) ?? "null");
	} catch {
		return null;
	}
}

/** @returns whether the value was stored */
export function writeJson(storageKey, value) {
	return writeItem(storageKey, JSON.stringify(value));
}

export function readItem(storageKey) {
	try {
		return localStorage.getItem(storageKey);
	} catch {
		return null;
	}
}

/** @returns whether the value was stored */
export function writeItem(storageKey, value) {
	try {
		localStorage.setItem(storageKey, value);
		return true;
	} catch (error) {
		console.warn(`"${storageKey}" could not be saved to localStorage:`, error);
		return false;
	}
}

export function removeItem(storageKey) {
	try {
		localStorage.removeItem(storageKey);
	} catch {
		// Storage that can't be reached has nothing to remove.
	}
}
