/**
 * Incident recording app
 *
 * James Mazikowski
 * (256) 655-2070
 * james@mazikowski.net
 */

var map
	, tempMarker
	, incidentsArray = []
	, formIsClean = true
	, dateTimeFormat = "DD MMM YYYY - HH:mm"
	, wfsGroup = []
	, countriesMaxZoom = 6
	, countries = L.layerGroup();

jQuery(document).ready(function( $ ) {
	var osmUrl = "http://{s}.tile.osm.org/{z}/{x}/{y}.png"
		, osmAttr =  "&copy; <a href='http://www.openstreetmap.org/'>OpenStreetMap</a> contributors."
		, osm = L.tileLayer(osmUrl, {
			attribution: osmAttr
		})
		, nexrad = L.tileLayer.wms("http://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r-t.cgi?", {
			layers: "nexrad-n0r-wmst",
			format: "image/png",
			transparent: true,
			attribution: "Some Attr"
		}).setOpacity(0.5);

	// Initialize the map using the "map" div
	map = L.map("map")
		.setView([34.73, -86.585], 12)      // Center the map
		.addLayer(osm)                      // Add OSM layer
		.addLayer(nexrad)                   // Add NEXRAD WMS layer
		.addControl(new customButtons())    // Add custom buttons for creating incidents
		.on("moveend", fetchGeoJson)        // Bind moveend event to refresh countries from WFS
		.on("overlayadd", fetchGeoJson);    // Update country layer data if needed

	// Add layer control to map
	var overlayMaps = {
		"NEXRAD Radar" : nexrad,
		"Countries"    : countries
	};
	L.control.layers(null, overlayMaps).addTo(map);

	// Fetch info from WFS after the map is loaded
	fetchGeoJson();

	// Load markers from local storage
	if (localStorage.getItem("incidentsArray") != null)
		initMarkers();

	// Attach material datetime picker to #inputDateTime
	$("#inputDateTime")
		.bootstrapMaterialDatePicker({
			format : dateTimeFormat
			, cancelText : "Back"
			, okText : "Next"
		});

	// Bind click event to #btnGetLocation
	$("#btnGetLocation")
		.click(function() {
			$("#createModal").modal("toggle");
			$("#btnCreate").hide();

			// Hide the countries layer so the marker can be placed
			if(map.hasLayer(countries))
				map.removeLayer(countries);

			if ( ! formIsClean )
				$("#btnAccept").show();

			// Don't place a new marker if we're still working with one
			if (formIsClean)
				map.once("click", onMapClick);

			// Reset validation error on #inputLocation
			setValidationError($("#inputLocation"), false);
		});

	// Bind click event to #btnDateTime
	$("#btnDateTime")
		.click(function() {

			// Trigger click event on #inputDateTime to open picker
			$("#inputDateTime").click();

			// Reset validation error on #inputDateTime
			setValidationError($("#inputDateTime"), false);
		});

	// Bind click event to #btnAccept
	$("#btnAccept")
		.click(function() {
			$("#createModal").modal("toggle");
			$("#btnCreate").show();
			$("#btnAccept").hide();
			$("#inputLocation")
				.val(tempMarker._latlng.lat.toFixed(5) + ", " + tempMarker._latlng.lng.toFixed(5))
				.attr("data-lat", tempMarker._latlng.lat)
				.attr("data-lng", tempMarker._latlng.lng);
		});

	// Bind click event to #createDialogCancel
	$("#createDialogCancel")
		.click(function() {
			resetCreateForm();
		});

	// Bind click event to #createDialogSave
	$("#createDialogSave")
		.click(function() {
			if(validateCreateForm()) {
				saveIncident();
				$("#createModal").modal("toggle");
				resetCreateForm();
			}
		});
});

// Defines custom buttons control for adding incidents
var customButtons =  L.Control.extend({
	options: {
		position: "bottomright"
	},

	onAdd: function (map) {
		var buttonWrapper = L.DomUtil.create("div", "leaflet-control");
		
		var createButton = L.DomUtil.create("button"
			, "btn btn-fab btn-raised btn-material-green"
			, buttonWrapper);
		createButton.id = "btnCreate";
		createButton.title = "Record New Incident";
		createButton.setAttribute("data-toggle", "modal");
		createButton.setAttribute("data-target", "#createModal");
		createButton.setAttribute("data-backdrop", "static");
		createButton.innerHTML = "<i class=\"mdi-content-add\"></i>";

		var acceptButton = L.DomUtil.create("button"
			, "btn btn-fab btn-raised btn-material-light-blue"
			, buttonWrapper);
		acceptButton.setAttribute("style", "display:none;");
		acceptButton.id = "btnAccept";
		acceptButton.title = "Record New Incident";
		acceptButton.innerHTML = "<i class=\"mdi-navigation-check\"></i>";
		return buttonWrapper;
	}
});

/**
 * Loads existing markers from local storage
 */
function initMarkers() {
	var incidentsFromStorage = JSON.parse(localStorage.getItem("incidentsArray"));
	$.each(incidentsFromStorage, function(key, val) {
		var latlng = val.data.latlng;
		placeMarker(latlng.lat, latlng.lng);
		tempMarkerBindPopup(val.data.type, moment(val.data.datetime));

		// Push the incident onto the array
		incidentsArray.push({
			id : tempMarker._leaflet_id
			, data : val.data
		});

		// Lock marker position
		tempMarker.dragging.disable();

		formIsClean = true;
	});

	// Null tempMarker to prevent possible weirdness
	tempMarker = null;
}

/**
 * Fetches GeoJSON data from WFS
 */
function fetchGeoJson(){
	if(map.hasLayer(countries)) { // Only pull data if the country layer is visible
		var geoJsonUrl ="http://demo.opengeo.org/geoserver/ows";
		var defaultParameters = {
			service: "WFS",
			version: "1.1.0",
			request: "getFeature",
			typeNames: "maps:ne_50m_admin_0_countries",
			maxFeatures: 500,
			outputFormat: "application/json"
		};

		var customParams = {
			bbox: map.getBounds().toBBoxString()+",EPSG:4326"
		};
		var parameters = L.Util.extend(defaultParameters, customParams);

		$.ajax({
			url: geoJsonUrl + L.Util.getParamString(parameters),
			datatype: "json",
			jsonCallback: "getJson",
			success: loadGeoJson
		});
	}
}

/**
 * Loads GeoJSON data fetched from WFS
 * @param data
 */
function loadGeoJson(data){
	L.Proj.geoJson(data, {
		onEachFeature: function (feature, featureLayer) {
			//console.log(feature.properties);

			featureLayer
				.setStyle({color: "red"})
				.on("mouseover", function (e) {
					this.setStyle({color: "blue"}); // Country polygon hover color
				})
				.on("mouseout", function (e) {
					this.setStyle({color: "red"});  // Country polygon default color
				}).bindPopup(
					"<strong>Name:</strong> " + feature.properties.name + " (" + feature.properties.abbrev + ")" +
						"<br />" +
						"<strong>Continent:</strong> " + feature.properties.continent +
						"<br />" +
						"<strong>Region:</strong> " + feature.properties.region_wb +
						"<br />" +
						"<strong>Type:</strong> " + feature.properties.type
				  , {closeButton: false}
				);

			var id = feature.id;
			if (wfsGroup[id] === undefined) {
				countries.addLayer(featureLayer);
				wfsGroup[id] = feature;
			}
		}
	});
}

/**
 * Triggers placeMarker when the map is clicked
 * @param e
 */
function onMapClick(e) {
	placeMarker(e.latlng.lat, e.latlng.lng);

	$("#btnAccept").show();
}

/**
 * Function to place a marker on the map
 * @param lat   Latitude value
 * @param lng   Longitude value
 */
function placeMarker(lat, lng) {
	var geojsonFeature = {
		"type": "Feature"
		, "properties": {}
		, "geometry": {
			"type": "Point"
			, "coordinates": [lat, lng]
		}
	};

	var marker;

	L.geoJson(geojsonFeature, {
		pointToLayer: function (feature, latlng) {
			// Changing icon on mouseover breaks click/drag.
			//var blueMarker = L.AwesomeMarkers.icon({
			//    icon: "info-sign",
			//    markerColor: "blue"
			//});

			marker = L.marker({lat: lat, lng: lng}, {
				title: "Incident Location",
				alt: "Incident Location",
				riseOnHover: true,
				draggable: true
			});

			// Bind mouseover and mouseout to trigger popup as a tooltip
			marker.on("mouseover", function(e) {
				marker.openPopup();
			});
			marker.on("mouseout", function(e) {
				marker.closePopup();
			});

			// Bind click to display incident details
			marker.on("click", function(e) {
				// Check form is clean to prevent handling the click event
				// while adding a new incident
				if (formIsClean) {
					var markerId = this._leaflet_id
						, incidentData = {}
						, incidentModal = $("#incidentModal");

					// Use $.each to find the data for this marker in the incidentsArray
					$.each(incidentsArray, function (key, val) {
						// Here "this" is the array item
						if (this.id == markerId)
							incidentData = this.data;
					});

					// Format data strings
					var data = {
						incidentLocation: Number(incidentData.latlng.lat).toFixed(5)
						+ ", "
						+ Number(incidentData.latlng.lng).toFixed(5)
						, incidentType: incidentData.type
						, incidentName: incidentData.name
						, incidentDateTime: moment(incidentData.datetime).format(dateTimeFormat)
						, incidentDescription: incidentData.description
					};

					// Populate the fields with the formatted data
					$.each(data, function (key, val) {
						incidentModal
							.find("#" + key)
							.text(val);
					});

					// Display the incident details dialog
					incidentModal.modal("toggle");
				}
			});

			tempMarker = marker;
			formIsClean = false;

			return marker;
		}


	}).addTo(map);
}

/**
 * Validates create form
 * @returns {boolean}
 */
function validateCreateForm() {
	var valid = true;

	// Validate Location
	if ( ! $("#inputLocation").val().length > 0 ) {
		valid = false;
		setValidationError($("#inputLocation"), true);
	}

	// Validate Type
	if ( ! $("#inputType").val().length > 0 ){
		valid = false;
		setValidationError($("#inputType"), true);
	}

	// Validate Name
	if (! $("#inputName").val().length > 0 ){
		valid = false;
		setValidationError($("#inputName"), true);
	}

	// Validate DateTime
	if (! $("#inputDateTime").val().length > 0 ) {
		valid = false;
		setValidationError($("#inputDateTime"), true);
	}

	return valid;
}

/**
 * Shows error message for and applies appropriate styles to form-groups
 * @param elem      jQuery object
 * @param state     Error state [true|false]
 */
function setValidationError(elem, state) {
	var helpBlock;

	if (elem.parent(".input-group").length) {   // Element is in an input-group
		helpBlock = elem.parent("div").siblings(".help-block");
	} else {    // Element is not in an input group
		helpBlock = elem.siblings(".help-block")
	}

	if (state) {
		helpBlock
			.show()
			.closest(".form-group")
			.addClass("has-error");
	} else {
		helpBlock
			.hide()
			.closest(".form-group")
			.removeClass("has-error");
	}
}

/**
 * Saves the incident
 */
function saveIncident() {
	var inputLocation = $("#inputLocation");

	var incident = {
		latlng : {
			lat : inputLocation.attr("data-lat")
		  , lng : inputLocation.attr("data-lng")
		}
	  , type        : $("#inputType").val()
	  , name        : $("#inputName").val()
	  , datetime    : moment($("#inputDateTime").val(), dateTimeFormat).format()
	  , description : $("#textDescription").val()
	};

	// Bind popup to the marker
	tempMarkerBindPopup(incident.type, moment(incident.datetime));

	// Push the incident onto the array
	incidentsArray.push({
		id : tempMarker._leaflet_id
	  , data : incident
	});

	// Lock marker position
	tempMarker.dragging.disable();

	// Null tempMarker to prevent possible weirdness
	tempMarker = null;

	// Update the local storage copy of incidentsArray
	localStorage.setItem("incidentsArray", JSON.stringify(incidentsArray));
}

/**
 * Binds a popup to the tempMarker
 * @param type  The type of the incident
 * @param date  The date of the incident (moment object)
 */
function tempMarkerBindPopup(type, date) {
	// Bind popup to the marker
	tempMarker.bindPopup(
		"<strong>" + type + "</strong> (" + date.format("D MMM YY") + ")"
	  , {closeButton: false}
	);
}

function resetCreateForm() {
	// Remove the marker we just placed from the map
	if (tempMarker !== null) {
		map.removeLayer(tempMarker);
		// Null tempMarker to prevent possible weirdness
		tempMarker = null;
	}

	// Clear the input fields
	$("#inputLocation").val("");
	$("#inputType").val("");
	$("#inputName").val("");
	$("#inputDateTime").val("");
	$("#textDescription").val("");

	// The form is now clean
	formIsClean = true;
}