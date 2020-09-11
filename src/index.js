const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// To fully inspect elements
const util = require('util');

// To style console output colors
const colors = require('colors');

let config = require('electron-node-config');

// Uses twitter-lite from here https://github.com/draftbit/twitter-lite
const Twitter = require('twitter-lite');

const client = new Twitter({
  subdomain: "api", // "api" is the default (change for other subdomains)
  version: "1.1", // version "1.1" is the default (change for other subdomains)
  consumer_key: config.twitter.consumer_key, // from Twitter.
  consumer_secret: config.twitter.consumer_secret, // from Twitter.
  access_token_key: config.twitter.access_token_key, // from your User (oauth_token)
  access_token_secret: config.twitter.access_token_secret // from your User (oauth_token_secret)
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true
    },
    width: 800,
    height: 600,
  });

  // Start the magic here
  mainWindow.setMenuBarVisibility(false)

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

var ipc = require('electron').ipcMain;
var unlike_count = 1;
var processing_count = 1;
var delete_array = new Array();


ipc.on('invokeAction', function(event, data){


    console.log((data.message).red.bgWhite);
    const last_id =  lets_twitter(data.last_tweet_id)
    .then( result => {
      event.sender.send('actionReply', result);
    })
    .catch((err) => {
      console.log(err);
    })

    ;
});

const lets_twitter = (last_id) => {
  return new Promise((resolve, reject) => {

    const favorites_count = client.get("users/show", {screen_name:"mlgoofbasha"}).then(result =>{
      console.log(("# of likes: " + result.favourites_count).blue.underline.bgWhite);
    }).catch(err => reject(err))

    favorites_count
    const parameters = {
      screen_name: config.targetAccount,
      count: 50,
      include_entities: true,
      //trim_user: true,
      include_ext_alt_text: true,
      tweet_mode: "extended"
    };

    if(typeof last_id !== "undefined"){
      if(last_id !== 0){
          parameters.max_id = last_id;
      }
    }
    var last_tweet_id = 0;

    client.get("favorites/list" , parameters)
    .then((results) => {
      console.log(("Got " + results.length + " results").green);
      if(results.length == 0){
        console.dir(results, { depth: null })
      }
      // Loop through the tweets
      results.forEach(element => {
        process.stdout.write(processing_count + ": Processing " + element.id + " by:@"+element.user.screen_name+", ")
        process_tweet(element);

        last_tweet_id = element.id_str;
      });

      processing_count = 1;
      unlike_count = 1;
      console.log("Finished twittering");
      console.log("Reached Resolve Statement".bgBrightRed.black);
      resolve(last_tweet_id);
    })
    .catch(err => reject(err));
  });
}

async function process_tweet(element){
  last_tweet_id = element.id_str;
  //if the tweet has extended_entities, meaning, images or videos, go inside.
  console.log(("https://twitter.com/"+element.user.screen_name+"/status/"+element.id_str).bgWhite.cyan)
  if(typeof element.extended_entities !== "undefined"){
    // loop through media of extended entity
    element.extended_entities.media.forEach((entity) => {

      if(entity.type == "video"){
        console.log("it is a video..");
        download_video(entity,element);
      }
      else if(entity.type == "photo"){
        console.log("it is a photo..");
        download_photo(entity,element);
      }
      else if(entity.type =="animated+gif"){
        console.log("it is a an animated GIF..");
        download_video(entity,element);
      }
      else{
        console.log("it is a "+ entity.type);
        console.log(JSON.stringify(element, null, 4));
      }
      processing_count++;

    });
  }
  else if(typeof element.entities !== "undefined"){

    console.log("seems to be a personal retweet, deal with it later".bgRed.white);
    console.log(JSON.stringify(element, null, 4));

    element.entities.urls.forEach(eurl =>{
      var our_url = eurl.expanded_url;
      if(our_url.startsWith("https://twitter.com/i/web/status")){
        our_url = our_url.substring(our_url.lastIndexOf('/') + 1)
        console.log(our_url)

        const parameters = {
          id: our_url,
          include_entities: true,
          //trim_user: true,
          include_ext_alt_text: true,
          tweet_mode: "extended"
        };

        client.get("statuses/show" , parameters).then(my_results => {
          //process_tweet(my_result);
          // TODO
          //Doing Nothing with personal
        })
        .catch(console.error);
      }
    })
  }
}

async function download_video(entity,element){
  // loop through variants
  var video_url = '';
  var bitrate = '0';

  // Pick the best bitrate
  entity.video_info.variants.forEach((variant) => {
    if(typeof variant.bitrate !== "undefined"){
      if(variant.bitrate >= bitrate){
        video_url = variant.url;
        bitrate = variant.bitrate;
      }
    }
  });

  //now lets clean the url
  const file_url = video_url.replace("https","http");

  const dirName = config.files.downloadLocation;
  if (!fs.existsSync(dirName)){
      fs.mkdirSync(dirName);
  }
  const fileName = dirName + element.user.screen_name + "_" + bitrate + "_" + file_url.replace(/^.*[\\\/]/, '').split('?')[0];
  const file = fs.createWriteStream(fileName);
  const request = http.get(file_url, function(response) {
    response.pipe(file);
  });

  await destroy_favorite(element.id_str);
}

async function download_photo(entity,element){
  // loop through variants
  var photo_url = entity.media_url;
  const file_url = photo_url.replace("https","http");
  const dirName = config.files.downloadLocation;
  console.log("Username is: " + element.user.screen_name)
  if (!fs.existsSync(dirName)){
      fs.mkdirSync(dirName);
  }
  const fileName = dirName + element.user.screen_name + "_" + file_url.replace(/^.*[\\\/]/, '').split('?')[0];
  const file = fs.createWriteStream(fileName);
  const request = http.get(file_url, function(response) {
    response.pipe(file);
  });

  await destroy_favorite(element.id_str);
}

async function destroy_favorite(id){

console.log((unlike_count + ": deleteing " + id+", ").bgRed.white);
  const parameters = {
    id: id
  };

  await client.post("favorites/destroy" , parameters).then(results => {
    console.log((unlike_count + ": Successfully unliked " + id).cyan);
  })
  .catch(console.error);

  unlike_count++;
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log("Exiting App, Bye Bye..".green);
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
