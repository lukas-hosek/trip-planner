/*
	Lengths and distances in the user's unit system (metric or imperial, see app-settings.js),
	written the way the interface language writes numbers ("3,2 km" in Czech, "3.2 km" in English).
*/

import { getUnitSystem, UNIT_SYSTEMS } from "../data/app-settings.js";
import { formatNumber } from "../language/translations.js";

const METERS_PER_FOOT = 0.3048;
const KILOMETERS_PER_MILE = 1.609344;
const FEET_PER_MILE = 5280;
// Below this, a distance reads better in the small unit (metres or feet) than as a fraction of the large one.
const SMALL_UNIT_BELOW_KILOMETERS = 1;
const SMALL_UNIT_BELOW_MILES = 0.1;
// From this distance on, a decimal place is noise.
const WHOLE_NUMBERS_FROM = 10;

/** "290 m", "3,2 km", "14 km" or "490 ft", "2.1 mi", "14 mi": the precision drops as the distance grows. */
export function formatDistance(kilometers) {
	if (getUnitSystem() === UNIT_SYSTEMS.imperial) {
		const miles = kilometers / KILOMETERS_PER_MILE;
		if (miles < SMALL_UNIT_BELOW_MILES) {
			return formatInUnit(roundToTens(miles * FEET_PER_MILE), "foot");
		}
		return formatInUnit(miles, "mile", miles < WHOLE_NUMBERS_FROM ? 1 : 0);
	}
	if (kilometers < SMALL_UNIT_BELOW_KILOMETERS) {
		return formatInUnit(roundToTens(kilometers * 1000), "meter");
	}
	return formatInUnit(kilometers, "kilometer", kilometers < WHOLE_NUMBERS_FROM ? 1 : 0);
}

/** A short length in whole metres or feet, such as the accuracy of a GPS fix. */
export function formatLength(meters) {
	if (getUnitSystem() === UNIT_SYSTEMS.imperial) {
		return formatInUnit(Math.round(meters / METERS_PER_FOOT), "foot");
	}
	return formatInUnit(Math.round(meters), "meter");
}

export function isMetric() {
	return getUnitSystem() === UNIT_SYSTEMS.metric;
}

function roundToTens(value) {
	return Math.round(value / 10) * 10;
}

/** A fixed number of decimals, so "3,0 km" doesn't shrink to "3 km" while "3,1 km" stays. */
function formatInUnit(value, unit, decimals = 0) {
	return formatNumber(value, { style: "unit", unit, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
