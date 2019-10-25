var express = require('express');
var path = require('path');
const bodyParser = require('body-parser');
const pino = require('express-pino-logger')();

var indexRouter = require('./routes/index');
var SpotifyWebApi = require('spotify-web-api-node');
var get = require('lodash/get');

var app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(pino);

var spotifyApi = new SpotifyWebApi({
	clientId: 'HIDDEN',
	clientSecret: 'HIDDEN',
	redirectUri: 'http://www.example.com/callback'
});

var last_refreshed = (new Date()).getTime();

function update_api() {
	spotifyApi.clientCredentialsGrant()
		.then(function (data) {
			spotifyApi.setAccessToken(data.body['access_token']);
		}, function (err) {
			console.log('Something went wrong when retrieving an access token', err.message);
		});
	var last_refreshed = (new Date()).getTime();
}

update_api();

// view engine setup
app.set('view engine', 'jade');
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);

app.get('/music-data/', function (req, res) {
	let band_name = req.query.band;
	let target_bpm = req.query.bpm;
	let bpm_variance = 5;

	l_b = parseInt(target_bpm) - parseInt(bpm_variance);
	u_b = parseInt(target_bpm) + parseInt(bpm_variance);

	recorded = new Set();
	song_list = [];

	if ((band_name !== undefined && target_bpm !== undefined)) {
		if (Math.floor(Math.abs((new Date()).getTime() - last_refreshed) / 60000) >= 59) {
			update_api();
		}
		try {
			spotifyApi.searchArtists(band_name)
				.then(function (data) {
					ID = get(data, "body.artists.items[0].id")
					if (ID !== "undefined") {
						return spotifyApi.getArtistAlbums(ID);
					}
				})
				.then(function (data_1) {
					albums = get(data_1, "body.items");
					if (albums !== "undefined") {
						let api_calls = [];
						albums.forEach(function (entry) {
							if (entry.id !== "undefined") {
								api_calls.push(spotifyApi.getAlbumTracks(entry.id));
							}
						});
						return Promise.all(api_calls.map(p => p.catch(e => e)));
					}
				})
				.then(function (album_tracks) {
					if (album_tracks !== "undefined") {
						let counter = [];
						let track_data = [];
						let i = 0;
						album_tracks.forEach(function (data_2) {
							tracks = get(data_2, "body.items");
							if (tracks !== "undefined") {
								tracks.forEach(function (entry) {
									if (entry.id !== "undefined" && !recorded.has(entry.name)) {
										counter.push(i);
										track_data.push([entry.id, entry.name, get(entry, "external_urls.spotify")]);
										i = i + 1;
									}
								});
							}
						});
						return Promise.all(counter.map(j => {
							return spotifyApi.getAudioAnalysisForTrack(track_data[j][0]).then((analysis) => {
								try {
									return [analysis, track_data[j][1], track_data[j][2]];
								}
								catch {
									console.log("Error in retriveing track analysis!");
								}
							});
						}));
					}
				})
				.then(function (songs) {
					if (songs !== "undefined") {
						for (var i = 0; i < songs.length; i++) {
							let song_tempo = get(songs[i][0], "body.track.tempo");
							if (song_tempo >= l_b && song_tempo <= u_b) {
								song_list.push([songs[i][1], song_tempo, songs[i][2]]);
								recorded.add(songs[i][1]);
							}
						}
					}
				})
				.finally(() => {
					return song_list;
				});
		}
		catch {
			console.log("Something went wrong!");
		}
	}
});

module.exports = app;