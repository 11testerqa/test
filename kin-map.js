
"use strict";
const demoPeople = [
  { id: "alex", name: "Alex", area: "KLCC", lat: 3.1578, lng: 101.7122, color: "#cc8466", avatar: "./images/avatar-2.png", demo: true },
  { id: "sarah", name: "Sarah", area: "Bukit Bintang", lat: 3.1475, lng: 101.7132, color: "#9b83bd", avatar: "./images/avatar-1.png", demo: true },
  { id: "jamie", name: "Jamie", area: "Kampung Baru", lat: 3.1645, lng: 101.7063, color: "#caa353", avatar: "./images/avatar-3.png", demo: true },
  { id: "chris", name: "Chris", area: "Ampang Park", lat: 3.1597, lng: 101.7197, color: "#6d9f94", avatar: "./images/avatar-4.png", demo: true },
  { id: "maya", name: "Maya", area: "Raja Chulan", lat: 3.1512, lng: 101.7104, color: "#bd809c", avatar: "./images/avatar-5.png", demo: true }
];
let people = demoPeople.map(person => ({ ...person }));
let selectedId = "sarah";
let map = null;
let markers = new Map();
let accuracyCircle = null;
let routeLayer = null;
let pendingRoute = null;
let requestVersion = 0;
let geolocationVersion = 0;
let locating = false;
let originId = "alex";
let destinationId = "sarah";
const byId = id => people.find(person => person.id === id);
const $ = id => document.getElementById(id);
const validCoordinates = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85.05112878 && Math.abs(lng) <= 180;
function directionsUrl(from, to) {
  if (!from || !to || from.id === to.id || !validCoordinates(from.lat, from.lng) || !validCoordinates(to.lat, to.lng)) return null;
  const query = new URLSearchParams({
    api: "1", origin: from.lat + "," + from.lng,
    destination: to.lat + "," + to.lng, travelmode: "driving"
  });
  return "https://www.google.com/maps/dir/?" + query.toString();
}
function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}
function portrait(person, className) {
  const holder = node("span", className || "portrait");
  holder.style.setProperty("--person-color", person.color);
  if (person.avatar) {
    const image = document.createElement("img");
    image.src = person.avatar;
    image.alt = "";
    image.addEventListener("error", () => { image.remove(); holder.textContent = person.name.slice(0, 1).toUpperCase(); }, { once: true });
    holder.append(image);
  } else holder.textContent = person.name.slice(0, 1).toUpperCase();
  return holder;
}
function locationKind(person) {
  return person.demo ? "Demo location" : person.id === "me" ? "Your device location" : "Shared coordinates";
}
function notify(message) {
  $("notice").textContent = message;
}
function selectedPerson() {
  const person = byId(selectedId);
  $("person-detail").hidden = !person;
  if (!person) return;
  $("detail-portrait").replaceChildren(portrait(person, "detail-avatar"));
  $("person-name").textContent = person.name;
  $("person-area").textContent = person.area;
  $("person-kind").textContent = locationKind(person);
  $("person-coordinates").textContent = person.lat.toFixed(5) + ", " + person.lng.toFixed(5);
  $("person-note").textContent = person.demo
    ? "A sample position for exploring the map. It does not track this person."
    : person.id === "me"
    ? "Accuracy: about " + Math.round(person.accuracy) + " m. Captured at " + new Date(person.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ". Not shared with other users."
    : "Shown exactly as entered. Confirm that these coordinates are current before travelling.";
  $("directions-to-person").disabled = person.id === originId || !byId(originId);
  $("directions-to-person").textContent = person.id === originId ? "Choose another person to visit" : "Directions to " + person.name;
  $("remove-location").hidden = person.demo;
  markers.forEach((marker, id) => {
    const element = marker.getElement();
    if (element) element.classList.toggle("selected-marker", id === selectedId);
  });
}
function choosePerson(id, focus = true) {
  const person = byId(id);
  if (!person) return;
  selectedId = id;
  selectedPerson();
  renderPeople();
  if (map && focus) map.flyTo([person.lat, person.lng], Math.max(map.getZoom(), 16), { duration: 0.7 });
}
function renderPeople() {
  const search = $("people-search").value.trim().toLocaleLowerCase();
  const visible = people.filter(person => (person.name + " " + person.area).toLocaleLowerCase().includes(search));
  const list = $("people-list");
  list.replaceChildren();
  $("people-count").textContent = people.length + (people.length === 1 ? " person on your map" : " people on your map");
  visible.forEach(person => {
    const item = node("button", "person-row" + (person.id === selectedId ? " active" : ""));
    item.type = "button";
    item.setAttribute("aria-pressed", String(person.id === selectedId));
    item.append(portrait(person));
    const text = node("span", "person-text");
    text.append(node("strong", "", person.name), node("span", "", person.area));
    const badge = node("span", "location-badge", person.demo ? "DEMO" : person.id === "me" ? "YOU" : "SHARED");
    item.append(text, badge);
    item.addEventListener("click", () => choosePerson(person.id));
    list.append(item);
  });
  $("people-empty").hidden = visible.length > 0;
  $("people-empty").textContent = people.length ? "No people match your search." : "Add a shared location or use your device location to start your map.";
  $("clear-demo").hidden = !people.some(person => person.demo);
  $("forget-location").hidden = !byId("me") && !locating;
}
function addMarker(person) {
  if (!map) return;
  const content = node("span", "map-person");
  content.style.setProperty("--person-color", person.color);
  content.append(portrait(person, "marker-portrait"), node("span", "marker-name", person.name));
  const icon = L.divIcon({ className: "kin-marker", html: content, iconSize: [74, 78], iconAnchor: [37, 65] });
  const marker = L.marker([person.lat, person.lng], { icon, title: person.name + " · " + locationKind(person), keyboard: true }).addTo(map);
  marker.on("click", () => choosePerson(person.id));
  markers.set(person.id, marker);
}
function refreshMarkers() {
  if (!map) return;
  markers.forEach(marker => marker.remove());
  markers.clear();
  people.forEach(addMarker);
  if (accuracyCircle) { accuracyCircle.remove(); accuracyCircle = null; }
  const me = byId("me");
  if (me) accuracyCircle = L.circle([me.lat, me.lng], {
    radius: me.accuracy, color: "#496a4c", weight: 1, opacity: 0.5, fillOpacity: 0.07, interactive: false
  }).addTo(map);
  selectedPerson();
}
function fitPeople() {
  if (!map) { notify("The map is unavailable. You can still open directions."); return; }
  if (!people.length) { map.setView([3.1578, 101.7122], 14); return; }
  const bounds = L.latLngBounds(people.map(person => [person.lat, person.lng]));
  map.fitBounds(bounds, { padding: [65, 65], maxZoom: people.length === 1 ? 16 : 15 });
}
function clearRoute() {
  requestVersion++;
  if (pendingRoute) { pendingRoute.abort(); pendingRoute = null; }
  if (routeLayer) { routeLayer.remove(); routeLayer = null; }
  $("route-button").disabled = false;
  $("route-button").textContent = "Show route";
  $("route-result").textContent = "Choose two people to see a driving route.";
}
function fillRouteSelectors() {
  if (!byId(originId)) originId = people[0]?.id || "";
  if (!byId(destinationId) || destinationId === originId) destinationId = people.find(person => person.id !== originId)?.id || "";
  ["route-from", "route-to"].forEach(id => {
    const select = $(id);
    select.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Choose a person";
    select.append(blank);
    people.forEach(person => {
      const option = document.createElement("option");
      option.value = person.id;
      option.textContent = person.name + (person.demo ? " · demo" : person.id === "me" ? " · you" : " · shared");
      select.append(option);
    });
  });
  $("route-from").value = originId;
  $("route-to").value = destinationId;
  updateDirectionsLink();
}
function updateDirectionsLink() {
  const from = byId(originId), to = byId(destinationId);
  const url = directionsUrl(from, to);
  const link = $("external-directions");
  link.hidden = !url;
  if (url) link.href = url;
  else link.removeAttribute("href");
  $("route-button").disabled = !url || !map;
  $("route-button").textContent = map ? "Show route" : "Map unavailable";
  $("route-caption").textContent = from?.demo || to?.demo
    ? "These are demo positions. Try shared coordinates for a real journey."
    : "Directions use the selected coordinates. Locations may have changed.";
  selectedPerson();
}
function routeSelectionChanged() {
  clearRoute();
  originId = $("route-from").value;
  destinationId = $("route-to").value;
  updateDirectionsLink();
}
async function showRoute() {
  clearRoute();
  const from = byId(originId), to = byId(destinationId);
  if (!directionsUrl(from, to)) {
    $("route-result").textContent = "Choose two different people.";
    updateDirectionsLink();
    return;
  }
  if (!map) {
    $("route-result").textContent = "Open directions to view this route in Google Maps.";
    updateDirectionsLink();
    return;
  }
  const version = requestVersion;
  const controller = new AbortController();
  pendingRoute = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  $("route-button").disabled = true;
  $("route-button").textContent = "Finding a route…";
  $("route-result").textContent = "Finding roads between " + from.name + " and " + to.name + "…";
  map.fitBounds([[from.lat, from.lng], [to.lat, to.lng]], { padding: [70, 70], maxZoom: 16 });
  try {
    const coords = from.lng + "," + from.lat + ";" + to.lng + "," + to.lat;
    const response = await fetch("https://router.project-osrm.org/route/v1/driving/" + coords + "?overview=full&geometries=geojson&alternatives=false", { signal: controller.signal });
    if (!response.ok) throw new Error("Routing unavailable");
    const data = await response.json();
    if (version !== requestVersion) return;
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route || route.geometry?.type !== "LineString" || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance < 0 || route.duration < 0) throw new Error("No road route");
    const points = route.geometry.coordinates.map(point => {
      if (!Array.isArray(point) || !validCoordinates(point[1], point[0])) throw new Error("Invalid route");
      return [point[1], point[0]];
    });
    const casing = L.polyline(points, { color: "#fff", weight: 9, opacity: 0.95, interactive: false });
    const line = L.polyline(points, { color: "#466a50", weight: 5, opacity: 0.98, interactive: false });
    routeLayer = L.featureGroup([casing, line]).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [65, 65], maxZoom: 16 });
    const minutes = Math.max(1, Math.round(route.duration / 60));
    $("route-result").textContent = from.name + " → " + to.name + " · " + (route.distance / 1000).toFixed(1) + " km · about " + minutes + " min driving";
    notify("Route ready. Open directions for navigation.");
  } catch (error) {
    if (version === requestVersion) {
      $("route-result").textContent = "The route service is unavailable or no road route was found. Use Open directions to continue.";
    }
  } finally {
    clearTimeout(timeout);
    if (version === requestVersion) {
      pendingRoute = null;
      $("route-button").textContent = "Show route";
      updateDirectionsLink();
    }
  }
}
function refreshPeople() {
  clearRoute();
  if (!byId(selectedId)) selectedId = people[0]?.id || "";
  renderPeople();
  fillRouteSelectors();
  refreshMarkers();
  selectedPerson();
}
function useDeviceLocation() {
  if (!navigator.geolocation) { notify("Your browser does not support location. You can add shared coordinates instead."); return; }
  if (locating) return;
  locating = true;
  const version = ++geolocationVersion;
  const button = $("use-location");
  button.disabled = true;
  button.textContent = "Finding you…";
  renderPeople();
  notify("Waiting for your browser’s location permission.");
  navigator.geolocation.getCurrentPosition(position => {
    if (version !== geolocationVersion) return;
    locating = false;
    button.disabled = false;
    button.textContent = "Use my location";
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    if (!validCoordinates(lat, lng) || !Number.isFinite(accuracy) || accuracy < 0) {
      notify("The returned location cannot be shown on this map. You can enter coordinates instead.");
      renderPeople();
      return;
    }
    const me = { id: "me", name: "You", area: "This device", lat, lng, accuracy, capturedAt: position.timestamp,
      color: "#68885d", avatar: "./images/avatar-6.png", demo: false };
    people = people.filter(person => person.id !== "me");
    people.unshift(me);
    originId = "me";
    selectedId = "me";
    refreshPeople();
    choosePerson("me");
    notify("Your location is on this device’s map for this visit. It is not shared with other people.");
  }, error => {
    if (version !== geolocationVersion) return;
    locating = false;
    button.disabled = false;
    button.textContent = "Use my location";
    renderPeople();
    notify(error.code === 1 ? "Location permission was declined. You can enter shared coordinates instead."
      : error.code === 3 ? "Location took too long. Try again outdoors or enter coordinates."
      : "Your location could not be determined. Try again or enter coordinates.");
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
function forgetDeviceLocation() {
  ++geolocationVersion;
  locating = false;
  $("use-location").disabled = false;
  $("use-location").textContent = "Use my location";
  people = people.filter(person => person.id !== "me");
  refreshPeople();
  notify("Your device location has been removed from this map.");
}
function initMap() {
  if (typeof L === "undefined") {
    $("map-unavailable").hidden = false;
    $("map-status").textContent = "Map unavailable";
    updateDirectionsLink();
    return;
  }
  try {
    map = L.map("map", { zoomControl: false, scrollWheelZoom: true, minZoom: 2, maxZoom: 19 }).setView([3.154, 101.712], 14);
    L.control.zoom({ position: "bottomleft" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
    let tileWarning = null;
    let tileRetried = false;
    tiles.on("tileerror", () => {
      $("map-status").textContent = "Some map tiles unavailable";
      $("tile-warning").hidden = false;
      if (tileWarning) clearTimeout(tileWarning);
      if (!tileRetried) {
        tileRetried = true;
        tileWarning = setTimeout(() => { if (map) tiles.redraw(); }, 10000);
      }
    });
    tiles.on("load", () => {
      if (tileWarning) clearTimeout(tileWarning);
      tileWarning = null;
    });
    tiles.on("tileload", () => {
      $("map-status").textContent = "OpenStreetMap · Free street map";
      $("tile-warning").hidden = true;
    });
    new ResizeObserver(() => map?.invalidateSize()).observe($("map"));
    refreshMarkers();
    fitPeople();
    updateDirectionsLink();
  } catch (error) {
    if (map) { try { map.remove(); } catch (_) {} }
    map = null;
    $("map-unavailable").hidden = false;
    $("map-status").textContent = "Map unavailable";
    updateDirectionsLink();
  }
}
function init() {
  $("people-search").addEventListener("input", renderPeople);
  $("fit-people").addEventListener("click", fitPeople);
  $("use-location").addEventListener("click", useDeviceLocation);
  $("forget-location").addEventListener("click", forgetDeviceLocation);
  $("route-from").addEventListener("change", routeSelectionChanged);
  $("route-to").addEventListener("change", routeSelectionChanged);
  $("route-button").addEventListener("click", showRoute);
  $("swap-route").addEventListener("click", () => {
    clearRoute();
    [originId, destinationId] = [destinationId, originId];
    $("route-from").value = originId;
    $("route-to").value = destinationId;
    updateDirectionsLink();
  });
  $("directions-to-person").addEventListener("click", () => {
    if (!byId(selectedId) || selectedId === originId) return;
    destinationId = selectedId;
    $("route-to").value = destinationId;
    showRoute();
    $("route-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  $("remove-location").addEventListener("click", () => {
    const person = byId(selectedId);
    if (!person || person.demo) return;
    if (person.id === "me") { forgetDeviceLocation(); return; }
    people = people.filter(entry => entry.id !== person.id);
    refreshPeople();
    notify(person.name + "’s shared location has been removed.");
  });
  $("clear-demo").addEventListener("click", () => {
    people = people.filter(person => !person.demo);
    refreshPeople();
    fitPeople();
    notify("Demo people removed. Add a location someone has shared with you.");
  });
  const dialog = $("add-dialog");
  let dialogTrigger = null;
  document.querySelectorAll("[data-add-location]").forEach(button => button.addEventListener("click", () => {
    dialogTrigger = button;
    $("add-error").textContent = "";
    if (!dialog.open) dialog.showModal();
  }));
  const closeDialog = () => { dialog.close(); dialogTrigger?.focus(); };
  $("close-dialog").addEventListener("click", closeDialog);
  $("cancel-add").addEventListener("click", closeDialog);
  $("add-form").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("shared-name").value.trim();
    const latText = $("shared-lat").value.trim(), lngText = $("shared-lng").value.trim();
    const lat = Number(latText), lng = Number(lngText);
    if (!name || !latText || !lngText || !validCoordinates(lat, lng)) {
      $("add-error").textContent = "Enter a name, latitude between −85.05112 and 85.05112, and longitude between −180 and 180.";
      return;
    }
    const id = "shared-" + crypto.randomUUID();
    people.push({ id, name, area: $("shared-area").value.trim() || "Shared location", lat, lng, color: "#8a9c74", demo: false });
    selectedId = id;
    destinationId = id;
    refreshPeople();
    choosePerson(id);
    closeDialog();
    $("add-form").reset();
    notify(name + "’s location was added for this visit.");
  });
  renderPeople();
  fillRouteSelectors();
  selectedPerson();
  initMap();
}
init();
