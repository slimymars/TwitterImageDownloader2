import { ImageInfo } from "./ImageInfo";
import { Setting, CreateDefaultSetting, IsLatestDataVersion, MigrateSetting1to2 } from "./Setting";

function doDownload(setting: Setting, image: ImageInfo){
	console.log("begin doDownload");
	console.log("setting", setting);
	console.log("image", image);
	chrome.storage.local.get("queue", (obj) => {
		console.log("get obj", obj);
		let queue : {url: string; filename: string; created: Date}[] = (obj === undefined || obj === null || !("queue" in obj)) ?
			[] : (obj.queue as {url: string; filename: string; created: Date}[]);
		queue = queue.filter((v)=>v.created.getTime() > Date.now() - 24 * 60 * 60 * 1000);
		queue.push({url: image.downloadUrl, filename: image.filename, created: new Date()})
		console.log("save queue", queue);
		chrome.storage.local.set({queue: queue}, ()=>{
			chrome.downloads.download({
				url: image.downloadUrl,
				filename: image.filename,
				saveAs: setting.open_save_as,
			});	
		});	
	});
}

function downloadImage(image: ImageInfo): void {
	chrome.storage.local.get((items) => {
		let setting: Setting = (items.download_to === undefined || items.download_to === null) ?
			CreateDefaultSetting() : (items as Setting);

		if(!IsLatestDataVersion(setting)){
			setting = MigrateSetting1to2(setting);

			chrome.storage.local.set(setting, () =>{
				doDownload(setting, image);
				console.log("TIL-Migration done.");
			});
		}
		else{
			doDownload(setting, image);
		}
	})
}

/**
 * create context menu
 */
chrome.contextMenus.removeAll()
chrome.contextMenus.create({
	type: 'normal',
	id: 'downloadTwitterImage',
	title: 'Download Original Image',
	contexts: [
		'image'
	],
	documentUrlPatterns: [
		'https://twitter.com/*'
	],
	targetUrlPatterns: [
		'https://pbs.twimg.com/media/*'
	],
});
chrome.contextMenus.create({
	type: 'normal',
	id: 'downloadTwitterImageLink',
	title: 'Download Original Image',
	contexts: [
		'image'
	],
	documentUrlPatterns: [
		'https://tweetdeck.twitter.com/*'
	],
	targetUrlPatterns: [
		'https://pbs.twimg.com/media/*'
	],
});

const sendMessage: (name: string, pageUrl: string, format: string, tabId?: number, srcUrl?: string) => void =
(name: string, pageUrl: string, format: string, tabId?: number, srcUrl?: string) =>
{
	chrome.tabs.sendMessage(
		tabId === undefined ? 0 : tabId,
		{ name: name, srcUrl: srcUrl, pageUrl: pageUrl, format: format},
		(response: ImageInfo | null) => {
			console.log("TIL send message response: ");
			console.log(response);

			if (response === null) {
				alert('The selected link is not a Twitter image.');
			} else if (response === undefined) {
				const errmsg = chrome.runtime.lastError;
				alert('err: ' + errmsg?.message);
				console.log('err', errmsg);
			} else {
				downloadImage(response);
			}
		}
	)
}

/**
 * on click context menu
 * send message to event page script
 */
chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
	console.log(info);
	if (tab === null || tab === undefined) return;
	let name: string = 'twitterImageDL';
	if (info.menuItemId === 'downloadTwitterImage') {
		name = 'twitterImageDL';
	}
	else if (info.menuItemId === 'downloadTwitterImageLink') {
		name = 'twitterImageDLLink';
	}
	chrome.storage.local.get((items: any) => {
		let setting: Setting = (items.download_to === undefined || items.download_to === null) ?
			CreateDefaultSetting() : (items as Setting);

		if(!IsLatestDataVersion(setting)){
			setting = MigrateSetting1to2(setting);

			chrome.storage.local.set(setting, () =>{
				console.log("TIL-Migration done.");
				sendMessage(name, info.pageUrl, setting.download_to!, tab.id, info.srcUrl);
			});
		}
		else{
			sendMessage(name, info.pageUrl, setting.download_to!, tab.id, info.srcUrl);
		}
	});
});

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
	if (item.byExtensionId !== chrome.runtime.id) return;
	console.log("onDeterminingFilename id", item.id);
	chrome.storage.local.get("queue", (obj) => {
		if (obj === undefined || obj === null || !("queue" in obj)) return;
		console.log("load queue obj", obj);
		let queue : {url: string; filename: string; created: Date}[] = obj.queue as {url: string; filename: string; created: Date}[];
		const i = queue.findIndex((v)=>v.url === item.url);
		if (i === -1) {
			console.log("not found queue.");
			return;
		}
		suggest({filename: queue[i].filename});
		queue.splice(i, 1);
		chrome.storage.local.set({queue: queue});
	});
	return true;
});
