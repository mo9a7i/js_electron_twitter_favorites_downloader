const {
	app,
	BrowserWindow
} = require('electron');

// To fully inspect elements
const util = require('util');
const path = require('path');

// To style console output colors
const colors = require('colors');

const myTwitter = require('./models/twitter')
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

ipc.on('invokeAction', (event, data) => {
	
	
	myTwitter.lets_twitter(data.last_tweet_id).then(result => {
			console.log('finished twittering');
			event.sender.send('actionReply', result);
		}).catch(err => {
			console.log(err);
		});
});

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