const EARTH_RADIUS_IN_KILOMETERS = 6371;

function degreesToRadians(degrees) {
	return degrees * Math.PI / 180;
}

/**
 * Great-circle ("as the crow flies") distance between two { latitude, longitude } points.
 * Haversine is plenty accurate for distances of a few kilometres.
 */
export function distanceInKilometers(from, to) {
	const latitudeDelta = degreesToRadians(to.latitude - from.latitude);
	const longitudeDelta = degreesToRadians(to.longitude - from.longitude);
	const haversine =
		Math.sin(latitudeDelta / 2) ** 2 +
		Math.cos(degreesToRadians(from.latitude)) * Math.cos(degreesToRadians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
	return 2 * EARTH_RADIUS_IN_KILOMETERS * Math.asin(Math.sqrt(haversine));
}

/** "290 m", "3,2 km", "14 km" — Czech decimal comma, precision drops as the distance grows. */
export function formatDistance(kilometers) {
	if (kilometers < 1) {
		const roundedMeters = Math.round(kilometers * 1000 / 10) * 10;
		return `${roundedMeters} m`;
	}
	const decimals = kilometers < 10 ? 1 : 0;
	return `${kilometers.toFixed(decimals).replace(".", ",")} km`;
}
