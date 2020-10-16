// Uses twitter-lite from here https://github.com/draftbit/twitter-lite
// I will convert this to a synchronous code
const Twitter = require('twitter-lite');
let config = require('electron-node-config');
const colors = require('colors');
const http = require('http');
const fs = require('fs');
var bigInt = require("big-integer");
const { resolve } = require('path');

let unlike_count = 1;
let processing_count = 1;

const client = new Twitter({
	subdomain: "api", // "api" is the default (change for other subdomains)
	version: "1.1", // version "1.1" is the default (change for other subdomains)
	consumer_key: config.twitter.consumer_key, // from Twitter.
	consumer_secret: config.twitter.consumer_secret, // from Twitter.
	access_token_key: config.twitter.access_token_key, // from your User (oauth_token)
	access_token_secret: config.twitter.access_token_secret // from your User (oauth_token_secret)
});

async function lets_twitter(last_id) {
	try{
		// Create a variable to hold the last tweet id, since we will resolve it
		var last_tweet_id = bigInt(0);
		
		if(last_id == '0'){
			last_id = null;
		}

		const favorites = await get_favorites(last_id);
		//console.log('favorites are: ' + favorites);
		console.log('We have got ' + favorites.length + ' for this cycle, now looping through');

		for(const favorite of favorites){
			process.stdout.write(processing_count + ": Processing " + favorite.id_str + " by:@" + favorite.user.screen_name + ", ")
			// Processing a tweet, means downloading its content, then unliking it,
			// both of which, don't need to wait for, but nice to know if it is completed.
			// I could use, then, destroy, or just let it do what it wants to do
			// I think wait for it to download before unliking it is better to avoid deleting before download finishes
			// even though it doesn't matter, but can avoid 
			try{
				console.log('processing tweet');
				const nothing = await process_tweet(favorite, processing_count);
				if(nothing == 'success'){
					console.log('destroying favorite');
					const what = await destroy_favorite(favorite.id_str, processing_count);
				}
			}catch(error){
				console.log('could not process tweet ' + favorite.id_str + ', moving to next');
				continue;
			}
			
			processing_count += 1;

			if(last_tweet_id == 0 || !last_tweet_id.lesser(bigInt(favorite.id_str))){
				last_tweet_id = bigInt(favorite.id_str);
			}
		}

		// TODO: fix the return value if no tweets were returned
		processing_count = 1;
		unlike_count = 1;
		console.log('last tweet id is: ' + bigInt(last_tweet_id).toString());
		return bigInt(last_tweet_id).toString();
	}catch(error){
		return error;
	}
}

async function get_favorites_count(){
	return new Promise((resolve, reject) =>{
		client.get("users/show", {
			screen_name: config.twitter.targetAccount
		}).then(result => {
			resolve(result.favourites_count);
		}).catch(err => {
			reject(err);
		});
	});
}

async function get_favorites(last_id) {
	const parameters = {
		screen_name: config.twitter.targetAccount,
		count: 50,
		include_entities: true,
		include_ext_alt_text: true,
		tweet_mode: "extended",
		//trim_user: true,
	};

	console.log('passed last id to get_favorites is: ' + last_id)

	if (typeof last_id != 'undefined') {
		if (last_id != 0) {
			parameters.max_id = bigInt(last_id).minus(1).toString();
			console.log('Getting tweets before: '+ parameters.max_id);
		}
	}
	
	try{
		const favorites = await client.get("favorites/list", parameters);
		//console.log(favorites);
		console.log(("Got " + favorites.length + " results").green);
		if (favorites.length == 0) {
			//console.dir(results, { depth: null });
			console.log("No More Results".bgRed)
		}

		return favorites;

	}catch(error){
		return error;
	}
}

async function destroy_favorite(id, processing_count) {
	console.log(processing_count + ': ' + (unlike_count + ": deleteing " + id + ", ").bgRed.white);
	const parameters = {
		id: id,
		include_entities: false,
	};

	try{
		await client.post("favorites/destroy", parameters)
		console.log((unlike_count + ": Successfully unliked " + id).cyan);
	}catch(error){
		console.error("failed destroying the like");
	}

	unlike_count += 1;
}

async function process_tweet(element, processing_count) {
	console.log(("https://twitter.com/" + element.user.screen_name + "/status/" + element.id_str).bgWhite.cyan)
	
	//if the tweet has extended_entities, meaning, images or videos, go inside.
	if (typeof element.extended_entities !== 'undefined') {
		// loop through media of extended entity
		console.log("It's a media, working on the download");
		for(const entity of element.extended_entities.media){
			if (entity.type == "video") {
				console.log("it is a video..");
				await download_video(entity, element);
			} 
			else if (entity.type == "photo") {
				console.log("it is a photo..");
				await download_photo(entity, element);
			} 
			else if (entity.type == "animated+gif") {
				console.log("it is a an animated GIF..");
				await download_video(entity, element);
			} 
			else {
				console.log("it is a " + entity.type);
				console.log(JSON.stringify(element, null, 4));
			}	
		}

		return 'success';
	} 
	else if (typeof element.entities !== "undefined") {
		console.log("seems to be a personal retweet, deal with it later".bgRed.white);
		console.log("Not an extended media tweet");
		//console.log(JSON.stringify(element, null, 4));

		element.entities.urls.forEach(eurl => {
			var our_url = eurl.expanded_url;
			if (our_url.startsWith("https://twitter.com/i/web/status")) {
				our_url = our_url.substring(our_url.lastIndexOf('/') + 1)
				console.log(our_url)

				const parameters = {
					id: our_url,
					include_entities: true,
					//trim_user: true,
					include_ext_alt_text: true,
					tweet_mode: "extended"
				};

				client.get("statuses/show", parameters).then(my_results => {
						//process_tweet(my_result);
						// TODO
						//Doing Nothing with personal
				}).catch(console.error);
			}
		});

		return 'failed';
	}
}

async function download_video(entity, element) {
	return new Promise((resolve, reject) => {
		// loop through variants
		var video_url = '';
		var bitrate = '0';

		// Pick the best bitrate
		entity.video_info.variants.forEach((variant) => {
			if (typeof variant.bitrate !== undefined) {
				if (variant.bitrate >= bitrate) {
					video_url = variant.url;
					bitrate = variant.bitrate;
				}
			}
		});

		//now lets clean the url
		const file_url = video_url.replace("https", "http");

		const dirName = config.files.downloadLocation + element.user.screen_name + '/';
		
		if (!fs.existsSync(dirName)) {
			fs.mkdirSync(dirName);
		}

		const fileName = dirName + bitrate + "_" + file_url.replace(/^.*[\\\/]/, '').split('?')[0];
		const file = fs.createWriteStream(fileName);

		http.get(file_url, response => {
			try{
				response.pipe(file);
				resolve('file written successfully');
			}
			catch(error){
				reject('file writing error');
			}
		});
	});
}

async function download_photo(entity, element) {
	return new Promise((resolve, reject) => {
		var photo_url = entity.media_url;
		const file_url = photo_url.replace("https", "http");
		const dirName = config.files.downloadLocation + element.user.screen_name + '/';
		
		if (!fs.existsSync(dirName)) {
			fs.mkdirSync(dirName);
		}

		const fileName = dirName + file_url.replace(/^.*[\\\/]/, '').split('?')[0];
		const file = fs.createWriteStream(fileName);

		http.get(file_url, response => {
			try{
				response.pipe(file);
				resolve('file written successfully');
			}
			catch(error){
				reject('file writing error');
			}
		});
	});
}

module.exports.lets_twitter = lets_twitter;