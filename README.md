# TripMap

An interactive, offline-capable map for trip plans: numbered pins on a hiking map, a list of places, and a detail card for each place with a photo, tips and links. It installs as an app on your phone and works without a signal on the trail. The interface is in Czech. Try it at **https://lukas-hosek.github.io/trip-planner/**. The first visit opens a demo plan of a week in Spain.

Plans are made with Claude. Download the [trip-map skill](https://lukas-hosek.github.io/trip-planner/trip-map-skill.zip) ([source](claude-skill/trip-map/)) and upload it in Claude under **Settings → Capabilities → Skills**, with code execution turned on. Plan a trip in a chat, and when it's settled, ask Claude to export it ("Exportuj plán do mapy"). Claude replies with a link that opens the plan in TripMap and saves it in your browser.
