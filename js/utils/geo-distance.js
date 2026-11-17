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
