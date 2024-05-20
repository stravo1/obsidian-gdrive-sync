import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
	TFile,
} from "obsidian";

import axios from "axios";
import ShortUniqueId from "short-unique-id";
import {
	deleteFile,
	getFile,
	getFileInfo,
	getFilesList,
	getFoldersList,
	getVaultId,
	modifyFile,
	renameFile,
	uploadFile,
	uploadFolder,
} from "./actions";

const PENDING_SYNC_FILE_NAME = "pendingSync-gdrive-plugin";
const ERROR_LOG_FILE_NAME = "error-log-gdrive-plugin.md";
const VERBOSE_LOG_FILE_NAME = "verbose-log-gdrive-plugin.md";

const ignoreFiles = [
	PENDING_SYNC_FILE_NAME,
	ERROR_LOG_FILE_NAME,
	VERBOSE_LOG_FILE_NAME,
];

/* helper functions */
function objectToMap(obj: Record<string, string>) {
	const map: Map<string, string> = new Map();
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			map.set(key, obj[key]);
		}
	}
	return map;
}

function mapToObject(map: Map<string, string>) {
	let obj: Record<string, string> = {};
	for (const [key, value] of map.entries()) {
		obj[key] = value;
	}
	return obj;
}

function bufferEqual(a: ArrayBuffer, b: ArrayBuffer) {
	let c: Uint8Array = new Uint8Array(a, 0);
	let d: Uint8Array = new Uint8Array(b, 0);
	if (a.byteLength != b.byteLength) return false;
	return equal8(c, d);
}

function equal8(a: Uint8Array, b: Uint8Array) {
	const ua = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
	const ub = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
	return compare(ua, ub);
}

function compare(a: Uint8Array, b: Uint8Array) {
	for (let i = a.length; -1 < i; i -= 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

const getAccessToken = async (
	refreshToken: string,
	showError: boolean = false
) => {
	var response;
	await axios
		.post(
			"https://red-formula-303406.ue.r.appspot.com/auth/obsidian/refresh-token",
			{
				refreshToken,
			}
		)
		.then((res) => {
			response = res.data;
		})
		.catch((err) => {
			if ((err.code = "ERR_NETWORK") && showError) {
				new Notice("Oops! Network error :(");
				new Notice("Or maybe no refresh token provided?", 5000);
				response = "network_error";
			} else {
				response = "error";
			}
		});
	return response;
};

const { randomUUID } = new ShortUniqueId({ length: 6 });

interface driveValues {
	refreshToken: string;
	accessToken: string;
	validToken: Boolean;
	vaultId: any;
	vaultInit: boolean;
	filesList: any[];
	rootFolderId: any;
	refresh: boolean;
	refreshTime: string;
	autoRefreshBinaryFiles: string;
	errorLoggingToFile: boolean;
	verboseLoggingToFile: boolean;
	//writingFile: boolean;
	//syncQueue: boolean;
}

const DEFAULT_SETTINGS: driveValues = {
	refreshToken: "",
	accessToken: "",
	validToken: false,
	vaultId: "",
	filesList: [],
	vaultInit: false,
	rootFolderId: "",
	refresh: false,
	refreshTime: "5",
	autoRefreshBinaryFiles: "0",
	errorLoggingToFile: false,
	verboseLoggingToFile: false,
	//writingFile: false,
	//syncQueue: false,
};

const metaPattern = /^---\n[\s\S]*---/;
const driveDataPattern = /\nlastSync:.*\n/;

interface pendingSyncItemInterface {
	fileID?: string;
	action: "UPLOAD" | "MODIFY" | "RENAME" | "DELETE";
	timeStamp: string;
	newFileName?: string;
	isBinaryFile?: boolean;
}

export default class driveSyncPlugin extends Plugin {
	settings: driveValues;
	cloudFiles: string[] = [];
	localFiles: string[] = [];
	timer: any = null;
	alreadyRefreshing: boolean = false;
	writingFile: boolean = false;
	syncQueue: string[] = [];
	isUploadingCurrentFile: boolean = false;
	latestContentThatWasSynced: ArrayBuffer | null = null;
	currentlyUploading: string | null = null; // to mitigate the issue of deleting recently created file while its being uploaded and gets overlaped with the auto-trash function call
	renamingList: string[] = [];
	deletingList: string[] = [];
	statusBarItem = this.addStatusBarItem().createEl("span", "sync_icon_still");
	pendingSync: boolean = false;
	connectedToInternet: boolean = true;
	checkingForConnectivity: boolean = false;
	pendingSyncItems: Array<pendingSyncItemInterface> = [];
	renamedWhileOffline: Map<string, string> = new Map();
	finalNamesForFileID: Map<string, string> = new Map();
	completingPendingSync: boolean = false;
	verboseLoggingForTheFirstTimeInThisSession: boolean = true;
	errorLoggingForTheFirstTimeInThisSession: boolean = true;
	lastErrorTime: Date = new Date(0);
	totalErrorsWithinAMinute: number = 0;
	haltAllOperations: boolean = false;

	completeAllPendingSyncs = async () => {
		if (this.haltAllOperations) {
			return;
		}
		/* files created when offline are assigned a dummy fileId 
		so the following Map keeps track of the dummy fielId to the actual fileId 
		which is retrieved when the file is uploadedf for the first time when online */
		await this.writeToVerboseLogFile(
			"LOG: Entering completeAllPendingSyncs"
		);
		let uuidToFileIdMap = new Map();

		let pendingSyncFile = this.app.vault.getAbstractFileByPath(
			PENDING_SYNC_FILE_NAME
		);

		pendingSyncFile instanceof TFile
			? console.log(
					JSON.parse(await this.app.vault.read(pendingSyncFile))
			  )
			: console.log("No file");

		let {
			pendingSyncItems,
			finalNamesForFileID,
		}: {
			pendingSyncItems: Array<pendingSyncItemInterface>;
			finalNamesForFileID: Record<string, string>;
		} =
			pendingSyncFile instanceof TFile
				? JSON.parse(await this.app.vault.read(pendingSyncFile))
				: { pendingSyncItems: [], finalNamesForFileID: new Map() };

		this.pendingSyncItems = [...pendingSyncItems];
		this.finalNamesForFileID = objectToMap(finalNamesForFileID);

		let finalNamesForFileIDMap = objectToMap(finalNamesForFileID);

		console.log(pendingSyncItems, finalNamesForFileID);

		if (pendingSyncItems.length) {
			new Notice(
				"ATTENTION: Syncing all pending changes since app was last online!"
			);
			new Notice(
				"Please wait till the sync is complete before proceeding with anything else..."
			);
		}

		try {
			this.settings.filesList = await getFilesList(
				this.settings.accessToken,
				this.settings.vaultId
			); // to get the last modifiedTimes
			this.completingPendingSync = true;
			for (var item of pendingSyncItems) {
				let lastCloudUpdateTime = new Date(0);
				let pendingSyncTime = new Date(item.timeStamp);
				this.settings.filesList.forEach((file) => {
					if (file.id == item.fileID) {
						lastCloudUpdateTime = new Date(file.modifiedTime!);
					}
				});
				switch (item.action) {
					case "DELETE":
						if (lastCloudUpdateTime < pendingSyncTime) {
							await deleteFile(
								this.settings.accessToken,
								uuidToFileIdMap.get(item.fileID)
									? uuidToFileIdMap.get(item.fileID)
									: item.fileID
							);
						}
						break;
					case "UPLOAD":
						var fileName = finalNamesForFileIDMap.get(item.fileID!);
						var file = this.app.vault.getAbstractFileByPath(
							fileName!
						);
						let actualId;
						if (file instanceof TFile) {
							if (item.isBinaryFile) {
								actualId = await this.uploadNewAttachment(file);
							} else {
								actualId = await this.uploadNewNotesFile(file);
							}
						}
						uuidToFileIdMap.set(item.fileID, actualId);
						finalNamesForFileIDMap.set(actualId, fileName!);
						this.finalNamesForFileID.set(actualId, fileName!);
						break;
					case "MODIFY":
						if (pendingSyncTime > lastCloudUpdateTime) {
							let file = this.app.vault.getAbstractFileByPath(
								finalNamesForFileIDMap.get(item.fileID!)!
							);
							if (file instanceof TFile) {
								await this.updateLastSyncMetaTag(file);
								var buffer = await this.app.vault.readBinary(
									file
								);
								await modifyFile(
									this.settings.accessToken,
									uuidToFileIdMap.get(item.fileID)
										? uuidToFileIdMap.get(item.fileID)
										: item.fileID,
									buffer
								);
							}
						}
						break;
					case "RENAME":
						if (pendingSyncTime > lastCloudUpdateTime) {
							await renameFile(
								this.settings.accessToken,
								uuidToFileIdMap.get(item.fileID)
									? uuidToFileIdMap.get(item.fileID)
									: item.fileID,
								finalNamesForFileIDMap.get(item.fileID!)
							);
						}
						break;
				}
				this.pendingSyncItems.shift();
				await this.writeToPendingSyncFile();
				new Notice(
					`Synced ${pendingSyncItems.indexOf(item) + 1}/${
						pendingSyncItems.length
					} changes`
				);
				await this.writeToVerboseLogFile(
					"LOG: completeAllPendingSyncs: Finished one operation"
				);
			}
		} catch (err) {
			if (err.message.includes("404")) {
				this.pendingSyncItems.shift();
				await this.writeToPendingSyncFile();
			}
			this.completingPendingSync = false;
			await this.notifyError();
			await this.checkForConnectivity();
			await this.writeToErrorLogFile(err);
		}
		if (pendingSyncItems.length) {
			new Notice("Sync complete!");
			this.finalNamesForFileID.clear();
			await this.writeToPendingSyncFile();
			await this.writeToVerboseLogFile(
				"LOG: completeAllPendingSyncs: Finished allpendingSyncs"
			);
		}
		this.completingPendingSync = false;
		this.pendingSync = false;
		await this.refreshAll();
		await this.writeToVerboseLogFile("LOG: Exited completeAllPendingSyncs");
	};

	checkForConnectivity = async () => {
		if (this.haltAllOperations) {
			return;
		}
		try {
			await this.writeToVerboseLogFile(
				"LOG: Entering checkForConnectivity"
			);
			await fetch("https://www.github.com/stravo1", {
				mode: "no-cors",
			});

			if (!this.connectedToInternet) {
				new Notice("Connectivity re-established!");
				this.connectedToInternet = true;
				this.checkingForConnectivity = false;
			}
			await this.completeAllPendingSyncs();
		} catch (err) {
			console.log("Checking for connectivity again after 5sec...");
			if (this.connectedToInternet) {
				console.log("error: " + err); // (currently fetch failed)
				new Notice("Connection lost :(");
				this.connectedToInternet = false;
				await this.writeToErrorLogFile(err);
			}
			setTimeout(() => {
				this.checkingForConnectivity = true;
				this.checkForConnectivity();
			}, 5000);
		}
		await this.writeToVerboseLogFile("LOG: Exited checkForConnectivity");
	};

	notifyError = async () => {
		if (this.haltAllOperations) {
			return;
		}
		if (!this.pendingSync) {
			this.pendingSync = true;
			new Notice("ERROR: Something went wrong! Sync might be paused!");
		}
		await this.writeToVerboseLogFile("LOG: Error occured");
		// check if the time between this error and last error was less than a minute:
		if (new Date().getTime() - this.lastErrorTime.getTime() < 60000) {
			this.totalErrorsWithinAMinute++;
		} else {
			this.totalErrorsWithinAMinute = 0;
		}
		if (this.totalErrorsWithinAMinute > 5) {
			this.haltAllOperations = true;
			setTimeout(async () => {
				await this.writeToErrorLogFile(
					new Error("FATAL ERROR: Too many errors within a minute.")
				);
				await this.writeToVerboseLogFile(
					"LOG: Too many errors within a minute. Halting all operations."
				);
				new Notice(
					"FATAL ERROR: Too many errors within a minute. Please reload the plug-in. If error persists, check the Verbose and Error Logs (turn them on in plug-in settings).",
					5000
				);
				new Notice(
					"Report issue by attaching the log files at https://github.com/stravo1/obsidian-gdrive-sync/issues/new",
					5000
				);
			}, 1500);
		}

		this.lastErrorTime = new Date();
	};

	cleanInstall = async () => {
		if (this.haltAllOperations) {
			return;
		}
		try {
			await this.writeToVerboseLogFile("LOG: Enerting cleanInstall");
			new Notice("Creating vault in Google Drive...");
			var res = await uploadFolder(
				this.settings.accessToken,
				this.app.vault.getName(),
				this.settings.rootFolderId
			);
			this.settings.vaultId = res;
			new Notice("Vault created!");
			new Notice(
				"Uploading files, this might take time. Please wait...",
				6000
			);
			var filesList = this.app.vault.getFiles();
			let noOfFiles = filesList.length;
			let count = 0;
			for (const file of filesList) {
				const buffer: any = await this.app.vault.readBinary(file);
				await uploadFile(
					this.settings.accessToken,
					file.path,
					buffer,
					this.settings.vaultId
				);
				count++;
				new Notice("Uploaded " + count + "/" + noOfFiles + " files");
			}
			new Notice("Files uploaded!");
			new Notice("Please reload the plug-in.", 5000);
		} catch (err) {
			new Notice("ERROR: Unable to initialize Vault in Google Drive");
			await this.checkForConnectivity();
			await this.writeToErrorLogFile(err);
		}
		await this.writeToVerboseLogFile("LOG: Exited cleanInstall");
	};

	refreshAll = async () => {
		if (this.haltAllOperations) {
			return;
		}
		await this.writeToVerboseLogFile("LOG: Entering refreshAll");
		try {
			if (!this.connectedToInternet) {
				console.log("ERROR: Connectivity lost, not refreshing...");
				return;
			}
			if (this.pendingSync) {
				console.log("PAUSED: Writing pending syncs, not refreshing...");
				if (!this.checkingForConnectivity) {
					setTimeout(() => {
						this.checkForConnectivity();
					}, 5000);
				}
				return;
			}
			if (this.alreadyRefreshing) {
				return;
			} else {
				this.alreadyRefreshing = true;
			}
			await this.refreshFilesListInDriveAndStoreInSettings();
			/* refresh both the files list */
			this.cloudFiles = [];
			this.localFiles = [];

			this.settings.filesList.map((file) =>
				this.cloudFiles.push(file.name)
			);
			this.app.vault
				.getFiles()
				.map((file) => this.localFiles.push(file.path));

			var toDownload = this.cloudFiles.filter(
				(file) =>
					!this.localFiles.includes(file) && // is not currently in vault
					!this.renamingList.includes(file) && // is not currently being renamed
					!this.deletingList.includes(file) // is not currently being deleted
			);

			await this.writeToVerboseLogFile(
				"LOG: Deleting files in refreshAll"
			);
			/* delete tracked but not-in-drive-anymore files */
			this.app.vault.getFiles().map(async (file) => {
				if (
					!this.cloudFiles.includes(file.path) &&
					!this.renamingList.includes(file.path) &&
					file.path != this.currentlyUploading
				) {
					if (file.extension != "md") {
						if (/-synced\.*/.test(file.path)) {
							this.app.vault.delete(file);
							return;
						}
					}
					var content = await this.app.vault.read(file);
					if (driveDataPattern.test(content)) {
						this.app.vault.delete(file);
					}
				}
			});

			await this.writeToVerboseLogFile(
				"LOG: Downloading missing files in refreshAll"
			);
			/* download new files or files that were renamed */
			if (toDownload.length) {
				new Notice("Downloading missing files", 2500);

				this.settings.refresh = true;
				for (const dFile of toDownload) {
					var id;
					this.settings.filesList.map((file: any) => {
						//console.log(file.name);

						if (file.name == dFile) {
							id = file.id;
						}
					});
					//console.log(id, dFile);

					var file = await getFile(this.settings.accessToken, id);
					await this.app.vault
						.createBinary(file[0], file[1])
						.catch(async () => {
							var path = file[0]
								.split("/")
								.slice(0, -1)
								.join("/");
							//console.log(path);

							await this.app.vault.createFolder(path);
							await this.app.vault.createBinary(file[0], file[1]);
						});
					new Notice(
						`Downloaded ${toDownload.indexOf(dFile) + 1}/${
							toDownload.length
						} files`,
						1000
					);
				}
				new Notice("Download complete :)", 2500);
				// new Notice(
				// 	"Sorry to make you wait for so long. Please continue with your work",
				// 	5000
				// );
				this.settings.refresh = false;
			}
			this.getLatestContent(this.app.workspace.getActiveFile()!);
			this.alreadyRefreshing = false;
			//console.log("refreshing filelist...");
		} catch (err) {
			this.notifyError();
			this.checkForConnectivity();
			await this.writeToErrorLogFile(err);
			this.alreadyRefreshing = false;
		}
		await this.writeToVerboseLogFile("LOG: Exited refreshAll");
	};
	uploadNewNotesFile = async (newFile: TFile) => {
		if (this.haltAllOperations) {
			return;
		}
		try {
			await this.writeToVerboseLogFile(
				"LOG: Entering uploadNewNotesFile"
			);
			if (!this.connectedToInternet) {
				console.log("ERROR: Connectivity lost, not uploading...");
				return;
			}
			if (
				newFile.extension != "md" ||
				newFile.path == this.currentlyUploading
			)
				return; // skip binary files or the file which is already being uploaded
			this.writingFile = true;
			this.currentlyUploading = newFile.path;

			new Notice("Uploading new file to Google Drive!");

			var content = await this.app.vault.read(newFile);

			var metaExists = metaPattern.test(content);
			var driveDataExists = driveDataPattern.test(content);
			if (!metaExists) {
				await this.app.vault.modify(
					newFile,
					`---\nlastSync: ${new Date().toString()}\n---\n` + content
				);
			} else if (!driveDataExists) {
				await this.app.vault.modify(
					newFile,
					content.replace(
						/^---\n/g,
						`---\nlastSync: ${new Date().toString()}\n`
					)
				);
			}

			var buffer: any = await this.app.vault.readBinary(newFile);
			var id = await uploadFile(
				this.settings.accessToken,
				newFile.path,
				buffer,
				this.settings.vaultId
			);

			this.writingFile = false;
			this.cloudFiles.push(newFile.path);
			await this.refreshFilesListInDriveAndStoreInSettings();
			this.currentlyUploading = null;

			new Notice("Uploaded!");
			await this.writeToVerboseLogFile("LOG: Exited uploadNewNotesFile");
			return id;
		} catch (err) {
			await this.notifyError();
			await this.checkForConnectivity();
			await this.writeToErrorLogFile(err);
			this.writingFile = false;
			this.currentlyUploading = null;
			await this.writeToVerboseLogFile("LOG: Exited uploadNewNotesFile");
		}
	};

	getLatestContent = async (
		file: TFile,
		forced: "forced" | false = false
	) => {
		try {
			if (this.haltAllOperations) {
				return;
			}
			await this.writeToVerboseLogFile("LOG: Entering getLatestContent");
			if (!this.connectedToInternet) {
				console.log(
					"ERROR: Connectivity lost, not fetching latest content..."
				);
				return;
			}
			if (
				this.cloudFiles.includes(file?.path!) &&
				!this.syncQueue.length
			) {
				var index = this.cloudFiles.indexOf(file?.path!);

				var cloudDate = new Date(
					this.settings.filesList[index].modifiedTime
				);
				var content: string;
				var timeStamp: any;
				var isBinaryFile: boolean = false;

				if (file.extension != "md") {
					isBinaryFile = true;
				} else {
					content = await this.app.vault.cachedRead(file!);
					timeStamp = content.match(/lastSync:.*/);
				}

				//console.log(cloudDate, new Date(timeStamp![0]));

				if (
					forced == "forced" ||
					(isBinaryFile &&
						parseInt(this.settings.autoRefreshBinaryFiles)) ||
					(timeStamp /* check if timeStamp is present */ &&
						cloudDate.getTime() >
							new Date(timeStamp![0]).getTime() +
								3000) /* allow 3sec delay in 'localDate' */
				) {
					// new Notice("Downloading updated file!");
					var id;
					this.settings.filesList.map((fileItem: any) => {
						if (fileItem.name == file.path) {
							id = fileItem.id;
						}
					});
					var res = await getFile(this.settings.accessToken, id);
					console.log("here", this.writingFile);

					if (
						this.syncQueue.length ||
						isBinaryFile ||
						this.writingFile
					)
						return;

					//console.log(this.syncQueue);
					this.latestContentThatWasSynced = res[1];

					await this.app.vault
						.modifyBinary(file, res[1])
						.catch(async () => {
							var path = res[0].split("/").slice(0, -1).join("/");
							//console.log(path);

							await this.app.vault.createFolder(path);
							await this.app.vault.modifyBinary(res[0], res[1]);
						});
					// new Notice("Sync complete :)");
				}
			}
		} catch (err) {
			await this.notifyError();
			await this.checkForConnectivity();
			await this.writeToErrorLogFile(err);
		}
		await this.writeToVerboseLogFile("LOG: Exited getLatestContent");
	};
	emptySyncQueue = async () => {
		if (this.haltAllOperations) {
			return;
		}

		await this.writeToVerboseLogFile("LOG: Entering emptySyncQueue");
		let path = this.syncQueue.shift(); // this tells that, uptil this moment, all changes are being accounted for the 1st file in sync queue
		this.isUploadingCurrentFile = true; // this ensures only one upload operation is going on at a time

		let file = this.app.vault.getAbstractFileByPath(path!);
		if (!(file instanceof TFile)) {
			return;
		}

		var id;
		this.settings.filesList.map((f: any) => {
			if (f.name == file!.path) {
				id = f.id;
			}
		});

		await this.updateLastSyncMetaTag(file);
		var buffer = await this.app.vault.readBinary(file);
		await modifyFile(this.settings.accessToken, id, buffer);

		this.statusBarItem.classList.replace("sync_icon", "sync_icon_still");
		setIcon(this.statusBarItem, "checkmark");

		this.isUploadingCurrentFile = false;
		await this.writeToVerboseLogFile("LOG: Exited emptySyncQueue");
	};

	checkAndEmptySyncQueue = async () => {
		if (this.haltAllOperations) return;
		await this.writeToVerboseLogFile(
			"LOG: Entering checkAndEmptySyncQueue"
		);
		if (this.haltAllOperations) {
			return;
		}
		if (this.syncQueue.length && !this.isUploadingCurrentFile) {
			this.emptySyncQueue();
		}
	};

	uploadNewAttachment = async (e: TFile) => {
		if (this.haltAllOperations) {
			return;
		}
		try {
			await this.writeToVerboseLogFile(
				"LOG: Entering uploadNewAttachment"
			);
			new Notice("Uploading new attachment!");
			var buffer: any = await this.app.vault.readBinary(e);
			const fileExtensionPattern = /\..*/;
			var newFileName = e.path.replace(
				fileExtensionPattern,
				"-synced" + e.path.match(fileExtensionPattern)![0]
			);

			this.currentlyUploading = newFileName;

			await this.app.vault.rename(e, newFileName);

			this.cloudFiles.push(newFileName);
			let id = await uploadFile(
				this.settings.accessToken,
				newFileName,
				buffer,
				this.settings.vaultId
			);

			this.currentlyUploading = null;
			new Notice("Uploaded!");

			new Notice(
				"Please make sure that all links to this attachment are updated with the new name: " +
					newFileName,
				5000
			);
			return id;
		} catch (err) {
			await this.notifyError();
			await this.checkForConnectivity();
			await this.writeToErrorLogFile(err);
		}
		await this.writeToVerboseLogFile("LOG: Exited uploadNewAttachment");
	};

	updateLastSyncMetaTag = async (e: TFile) => {
		await this.writeToVerboseLogFile("LOG: Entering updateLastSyncMetaTag");
		var content = await this.app.vault.read(e);

		var metaExists = metaPattern.test(content);
		var driveDataExists = driveDataPattern.test(content);

		if (metaExists) {
			if (driveDataExists) {
				this.app.vault.modify(
					e,
					content.replace(
						driveDataPattern,
						`\nlastSync: ${new Date().toString()}\n`
					)
				);
			} else {
				this.app.vault.modify(
					e,
					content.replace(
						/^---\n/g,
						`---\nlastSync: ${new Date().toString()}\n`
					)
				);
			}
		} else {
			this.app.vault.modify(
				e,
				`---\nlastSync: ${new Date().toString()}\n---\n` + content
			);
		}
		await this.writeToVerboseLogFile("LOG: Exited updateLastSyncMetaTag");
	};

	writeToPendingSyncFile = async () => {
		await this.writeToVerboseLogFile(
			"LOG: Entering writeToPendingSyncFile"
		);
		let pendingSyncFile = this.app.vault.getAbstractFileByPath(
			PENDING_SYNC_FILE_NAME
		);
		// console.log(
		// 	this.pendingSyncItems,
		// 	this.finalNamesForFileID,
		// 	JSON.stringify({
		// 		pendingSyncItems: this.pendingSyncItems,
		// 		finalNamesForFileID: mapToObject(this.finalNamesForFileID),
		// 	})
		// );

		if (pendingSyncFile instanceof TFile) {
			await this.app.vault.modify(
				pendingSyncFile,
				JSON.stringify({
					pendingSyncItems: this.pendingSyncItems,
					finalNamesForFileID: mapToObject(this.finalNamesForFileID),
				})
			);
		} else {
			await this.app.vault.create(
				PENDING_SYNC_FILE_NAME,
				JSON.stringify({
					pendingSyncItems: this.pendingSyncItems,
					finalNamesForFileID: mapToObject(this.finalNamesForFileID),
				})
			);
		}
		await this.writeToVerboseLogFile("LOG: Exited writeToPendingSyncFile");
	};
	refreshFilesListInDriveAndStoreInSettings = async () => {
		if (this.haltAllOperations) {
			return;
		}
		/*
		fetches all the files that are backed-up in drive and
		stores them in data.json file which contains all the settings,
		this list can be used to get the last known list of files on drive
		in case of offline operations when even the initial fetch request
		for retreiving the files list also fails
		*/
		await this.writeToVerboseLogFile(
			"LOG: Entering refreshFilesListInDriveAndStoreInSettings"
		);
		try {
			this.settings.filesList = await getFilesList(
				this.settings.accessToken,
				this.settings.vaultId
			);
		} catch (err) {
			this.notifyError();
			this.checkForConnectivity();
			await this.writeToErrorLogFile(err);
		}
		this.saveSettings();
		await this.writeToVerboseLogFile(
			"LOG: Exiting refreshFilesListInDriveAndStoreInSettings"
		);
	};

	writeToErrorLogFile = async (log: Error) => {
		await this.writeToVerboseLogFile("LOG: Entering writeToErrorLogFile");
		if (!this.settings.errorLoggingToFile) {
			return;
		}
		let errorLogFile =
			this.app.vault.getAbstractFileByPath(ERROR_LOG_FILE_NAME);
		console.log(log.stack, "logging");

		let content: string;

		if (errorLogFile instanceof TFile) {
			content = !this.errorLoggingForTheFirstTimeInThisSession
				? await this.app.vault.read(errorLogFile)
				: "";
			await this.app.vault.modify(
				errorLogFile,
				`${content}\n\n${new Date().toString()}-${log.name}-${
					log.message
				}-${log.stack}`
			);
			this.errorLoggingForTheFirstTimeInThisSession = false;
		} else {
			await this.app.vault.create(
				ERROR_LOG_FILE_NAME,
				`${new Date().toString()}-${log.name}-${log.message}-${
					log.stack
				}`
			);
		}
		await this.writeToVerboseLogFile("LOG: Exited writeToErrorLogFile");
	};

	writeToVerboseLogFile = async (log: string) => {
		if (!this.settings.verboseLoggingToFile) {
			return;
		}
		let verboseLogFile = this.app.vault.getAbstractFileByPath(
			VERBOSE_LOG_FILE_NAME
		);
		console.log(log);

		let content: string;

		try {
			if (verboseLogFile instanceof TFile) {
				content = !this.verboseLoggingForTheFirstTimeInThisSession
					? await this.app.vault.read(verboseLogFile)
					: "";
				await this.app.vault.modify(
					verboseLogFile,
					`${content}\n\n${log}`
				);
				// console.log("modified", log, `${content}\n\n${log}`);
				this.verboseLoggingForTheFirstTimeInThisSession = false;
			} else {
				await this.app.vault.create(VERBOSE_LOG_FILE_NAME, `${log}`);
			}
		} catch (err) {
			console.log(err);
		}
	};

	async onload() {
		await this.loadSettings();

		await this.writeToVerboseLogFile("LOG: getAccessToken");
		var res: any = await getAccessToken(this.settings.refreshToken, true); // get accessToken
		var count = 0;
		while (res == "error") {
			new Notice(
				"ERROR: Couldn't fetch accessToken. Trying again in 5 secs, please wait..."
			);
			await this.writeToErrorLogFile(
				new Error(
					"ERROR: Couldn't fetch accessToken. Trying again in 5 secs."
				)
			);
			await this.writeToVerboseLogFile(
				"LOG: failed to fetch accessToken"
			);
			if (!this.settings.refreshToken) {
				await this.writeToVerboseLogFile("LOG: no refreshToken");
				break;
			}
			console.log("Trying to get accessToken again after 5secs...");
			let resolvePromise: Function;
			let promise = new Promise((resolve, reject) => {
				resolvePromise = resolve;
			});
			setTimeout(() => {
				resolvePromise();
			}, 5000);
			await promise;
			await this.writeToVerboseLogFile(
				"LOG: trying to fetch accessToken again"
			);
			res = await getAccessToken(this.settings.refreshToken);
			count++;
			if (count == 6) {
				this.settings.accessToken = "";
				this.settings.validToken = false;
				new Notice(
					"FATAL ERROR: Connection timeout, couldn't fetch accessToken :("
				);
				new Notice(
					"Check your internet connection and restart the plugin..."
				);
				this.connectedToInternet = false;

				/* use previously fetched fileList (can't beleive this is actually becoming useful) */
				this.settings.filesList.map((file) =>
					this.cloudFiles.push(file.name)
				);
				this.app.vault
					.getFiles()
					.map((file) => this.localFiles.push(file.path));

				let pendingSyncFile = this.app.vault.getAbstractFileByPath(
					PENDING_SYNC_FILE_NAME
				);

				let {
					pendingSyncItems,
					finalNamesForFileID,
				}: {
					pendingSyncItems: Array<pendingSyncItemInterface>;
					finalNamesForFileID: Record<string, string>;
				} =
					pendingSyncFile instanceof TFile
						? JSON.parse(await this.app.vault.read(pendingSyncFile))
						: {
								pendingSyncItems: [],
								finalNamesForFileID: new Map(),
						  };

				this.pendingSyncItems = [...pendingSyncItems];
				this.finalNamesForFileID = objectToMap(finalNamesForFileID);
				break;
			}
		}

		try {
			if (res != "error" && res != "network_error") {
				await this.writeToVerboseLogFile("LOG: received accessToken");
				// if accessToken is available
				this.settings.accessToken = res.access_token;
				this.settings.validToken = true;
				var folders = await getFoldersList(this.settings.accessToken); // look for obsidian folder
				var reqFolder = folders.filter(
					(folder: any) => folder.name == "obsidian"
				);
				if (reqFolder.length) {
					await this.writeToVerboseLogFile(
						"LOG: rootFolder available"
					);
					this.settings.rootFolderId = reqFolder[0].id; // set the rootFolder or obsidian folder id
				} else {
					await this.writeToVerboseLogFile(
						"LOG: rootFolder unavailable, uploading"
					);
					new Notice("Initializing required files"); // else create the folder
					this.settings.rootFolderId = await uploadFolder(
						this.settings.accessToken,
						"obsidian"
					);
				}
				this.saveSettings();
			}
		} catch (err) {
			await this.notifyError();
			await this.writeToVerboseLogFile(
				"FATAL ERROR: Could not fetch rootFolder"
			);
			await this.writeToErrorLogFile(err);
			await this.writeToErrorLogFile(
				new Error("FATAL ERROR: Could not fetch rootFolder")
			);
			new Notice("FATAL ERROR: Could not fetch rootFolder");
			await this.writeToVerboseLogFile("LOG: adding settings UI");
			this.addSettingTab(new syncSettings(this.app, this));
			return;
		}
		// else {
		// 	// accessToken is not available
		// 	this.settings.accessToken = "";
		// 	this.settings.validToken = false;
		// }
		if (this.settings.validToken) {
			try {
				await this.writeToVerboseLogFile("LOG: getting vault id");
				this.settings.vaultId = await getVaultId(
					// get vaultId for the current fold
					this.settings.accessToken,
					this.app.vault.getName(),
					this.settings.rootFolderId
				);
			} catch (err) {
				await this.writeToErrorLogFile(err);
				new Notice(
					"FATAL ERROR: Couldn't get VaultID from Google Drive :("
				);
				await this.writeToVerboseLogFile(
					"FATAL ERROR: Couldn't get VaultID from Google Drive :("
				);
				new Notice("Check internet connection and restart plugin.");
				await this.writeToVerboseLogFile("LOG: adding settings UI");
				this.addSettingTab(new syncSettings(this.app, this));
				return;
			}
			if (this.settings.vaultId == "NOT FOUND") {
				await this.writeToVerboseLogFile("LOG: vault not found");
				// if vault doesn't exist
				this.settings.vaultInit = false;
				new Notice(
					`Oops! No vaults named ${this.app.vault.getName()} found in Google Drive`
				);
				new Notice(
					"Try initializing vault in Google Drive from plug-in settings :)",
					5000
				);
			} else {
				// if vault exists
				this.settings.vaultInit = true;
				await this.completeAllPendingSyncs();
				await this.refreshAll();
				this.registerInterval(
					window.setInterval(async () => {
						this.refreshAll();
					}, parseInt(this.settings.refreshTime) * 1000)
				);
				this.registerInterval(
					window.setInterval(async () => {
						this.checkAndEmptySyncQueue();
					}, 1000)
				);
			}
		}

		// This adds a settings tab so the user can configure various aspects of the plugin
		await this.writeToVerboseLogFile("LOG: adding settings UI");
		this.addSettingTab(new syncSettings(this.app, this));
		if (!this.settings.vaultInit) return;

		/* extract new files to be down/uploaded */
		this.settings.filesList.map((file) => this.cloudFiles.push(file.name));
		this.app.vault
			.getFiles()
			.map((file) => this.localFiles.push(file.path));

		//console.log(toUpload, toDownload);

		this.registerEvent(
			this.app.vault.on("rename", async (newFile, oldpath) => {
				if (ignoreFiles.includes(newFile.path)) {
					return;
				}
				if (this.completingPendingSync) {
					await this.writeToVerboseLogFile(
						"LOG: not renaming as pending sync is ongoing"
					);
					return;
				}
				try {
					if (!this.connectedToInternet) {
						await this.writeToVerboseLogFile(
							"LOG: Connectivity lost, not renaming files to Google Drive"
						);
						console.log(
							"ERROR: Connectivity lost, not renaming files to Google Drive..."
						);
						if (!this.cloudFiles.length) {
							console.log(
								"FATAL ERROR: Nothing in cloudFiles...."
							);
							return;
						}
						if (
							!this.cloudFiles.includes(oldpath) &&
							!this.renamedWhileOffline.get(oldpath)
						) {
							await this.writeToVerboseLogFile(
								"LOG: new file created while offline"
							);
							if (newFile instanceof TFile) {
								let id = randomUUID();
								this.pendingSyncItems.push({
									newFileName: newFile.path,
									action: "UPLOAD",
									fileID: id,
									timeStamp: new Date().toString(),
								});
								this.renamedWhileOffline.set(newFile.path, id);
								this.finalNamesForFileID.set(id, newFile.path);
							}
						} else {
							await this.writeToVerboseLogFile(
								"LOG: renamed while offline"
							);
							let idIfWasAlreadyRenamedOffline =
								this.renamedWhileOffline.get(oldpath);
							let id: string;
							if (idIfWasAlreadyRenamedOffline) {
								id = idIfWasAlreadyRenamedOffline;
							} else {
								// this should change to proper id, if not then error
								this.settings.filesList.map((file, index) => {
									if (file.name == oldpath) {
										id = file.id;
									}
								});
							}
							this.pendingSyncItems.push({
								fileID: id!,
								action: "RENAME",
								timeStamp: new Date().toString(),
							});
							this.renamedWhileOffline.set(newFile.path, id!);
							this.renamedWhileOffline.delete(oldpath);
							this.finalNamesForFileID.set(id!, newFile.path);
						}
						await this.writeToPendingSyncFile();
						return;
					}
					/* this is for newly created files
					as the newly created file is always renamed first
					so it checks that whether the file was already in cloudFiles:
					if it was there we do normal renaming else we upload the new file
					*/
					if (!this.cloudFiles.includes(oldpath)) {
						if (newFile instanceof TFile) {
							this.uploadNewNotesFile(newFile);
						}
						return;
					}

					await this.writeToVerboseLogFile(
						"LOG: renaming while online"
					);
					/* actual renaming of file */
					var id;
					var reqFile = ""; // required for changing the name of the file in the cloudsFile list
					this.settings.filesList.map((file, index) => {
						if (file.name == oldpath) {
							id = file.id;
							reqFile = file.name;
						}
					});
					this.renamingList.push(oldpath);

					this.cloudFiles[this.cloudFiles.indexOf(reqFile)] =
						newFile.path; // update the renamed file in cloudfiles
					await renameFile(
						this.settings.accessToken,
						id,
						newFile.path
					);
					new Notice("Files/Folders renamed!");

					this.renamingList.splice(
						this.renamingList.indexOf(oldpath),
						1
					);
					await this.writeToVerboseLogFile(
						"LOG: renamed while online"
					);

					await this.refreshFilesListInDriveAndStoreInSettings();
				} catch (err) {
					await this.notifyError();
					await this.checkForConnectivity();
					await this.writeToErrorLogFile(err);
					this.renamingList = [];
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("create", async (e) => {
				if (ignoreFiles.includes(e.path)) {
					return;
				}
				if (this.completingPendingSync) {
					await this.writeToVerboseLogFile(
						"LOG: not uploading as pending sync is ongoing"
					);
					return;
				}
				try {
					if (!this.connectedToInternet) {
						console.log(
							"ERROR: Connectivity lost, not uploading files to Google Drive..."
						);
						await this.writeToVerboseLogFile(
							"LOG: Connectivity lost, not uploading files to Google Drive"
						);
						if (e instanceof TFile && !/-synced\.*/.test(e.path)) {
							if (e.extension != "md") {
								await this.writeToVerboseLogFile(
									"LOG: created attachment while offline"
								);
								let id = randomUUID();
								this.pendingSyncItems.push({
									action: "UPLOAD",
									timeStamp: new Date().toString(),
									newFileName: e.path,
									isBinaryFile: true,
									fileID: id,
								});
								this.renamedWhileOffline.set(e.path, id);
								this.finalNamesForFileID.set(id, e.path);
							}
						}
						await this.writeToPendingSyncFile();
						return;
					}

					if (e instanceof TFile && !/-synced\.*/.test(e.path)) {
						if (e.extension != "md") {
							await this.writeToVerboseLogFile(
								"LOG: created attachment while online"
							);
							await this.uploadNewAttachment(e);
						}
					}
				} catch (err) {
					await this.notifyError();
					await this.checkForConnectivity();
					await this.writeToErrorLogFile(err);
					this.currentlyUploading = null;
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", async (e) => {
				if (ignoreFiles.includes(e.path)) {
					return;
				}
				if (this.completingPendingSync) {
					await this.writeToVerboseLogFile(
						"LOG: not deleting as pending sync is ongoing"
					);
					return;
				}

				try {
					if (!this.connectedToInternet) {
						console.log(
							"ERROR: Connectivity lost, not deleting files from Google Drive..."
						);
						await this.writeToVerboseLogFile(
							"LOG: Connectivity lost, not deleting files from Google Drive"
						);
						let id;
						this.settings.filesList.map((file, index) => {
							if (file.name == e.path) {
								id = file.id;
							}
						});
						await this.writeToVerboseLogFile(
							"LOG: deleting while offline"
						);
						this.pendingSyncItems.push({
							fileID: id,
							action: "DELETE",
							timeStamp: new Date().toString(),
						});
						this.renamedWhileOffline.delete(e.path);
						if (id) this.finalNamesForFileID.delete(id);
						await this.writeToPendingSyncFile();
						return;
					}
					if (this.settings.refresh) return;
					var id;
					this.settings.filesList.map((file) => {
						if (file.name == e.path) {
							id = file.id;
						}
					});
					this.deletingList.push(e.path);

					await this.writeToVerboseLogFile(
						"LOG: deleting while online"
					);
					var successful = await deleteFile(
						this.settings.accessToken,
						id
					);
					if (successful) new Notice("File deleted!"); // only when actual file from the drive was deleted

					this.deletingList.splice(
						this.deletingList.indexOf(e.path),
						1
					);

					await this.refreshFilesListInDriveAndStoreInSettings();
				} catch (err) {
					await this.notifyError();
					await this.checkForConnectivity();
					await this.writeToErrorLogFile(err);
					this.deletingList = [];
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("modify", async (e) => {
				if (ignoreFiles.includes(e.path)) {
					return;
				}
				if (this.completingPendingSync) {
					await this.writeToVerboseLogFile(
						"LOG: not modifying because pending sync"
					);
					return;
				}
				try {
					if (!this.connectedToInternet) {
						console.log(
							"ERROR: Connectivity lost, not modifying files on Google Drive..."
						);
						await this.writeToVerboseLogFile(
							"LOG: Connectivity lost, not modifying files on Google Drive"
						);
						if (!this.cloudFiles.length) {
							console.log(
								"FATAL ERROR: Nothing in cloudFiles...."
							);
							return;
						}
						if (
							!this.cloudFiles.includes(e.path) &&
							!this.renamedWhileOffline.get(e.path)
						) {
							if (e instanceof TFile) {
								await this.writeToVerboseLogFile(
									"LOG: created file while offline"
								);
								let id = randomUUID();
								this.pendingSyncItems.push({
									newFileName: e.path,
									action: "UPLOAD",
									timeStamp: new Date().toString(),
									fileID: id,
								});
								this.renamedWhileOffline.set(e.path, id);
								this.finalNamesForFileID.set(id, e.path);
							}
						} else {
							let id;
							if (this.renamedWhileOffline.get(e.path)) {
								id = this.renamedWhileOffline.get(e.path);
							} else {
								this.settings.filesList.map((file, index) => {
									if (file.name == e.path) {
										id = file.id;
									}
								});
							}
							let lastItemOnPendingSync =
								this.pendingSyncItems[
									this.pendingSyncItems.length - 1
								];
							if (
								lastItemOnPendingSync?.fileID == id &&
								lastItemOnPendingSync?.action == "MODIFY"
							) {
								this.pendingSyncItems.pop();
							}
							await this.writeToVerboseLogFile(
								"LOG: modifying file while offline"
							);
							this.pendingSyncItems.push({
								fileID: id,
								action: "MODIFY",
								timeStamp: new Date().toString(),
							});
						}
						await this.writeToPendingSyncFile();
						return;
					}
					if (!this.cloudFiles.includes(e.path)) {
						if (e instanceof TFile) {
							await this.writeToVerboseLogFile(
								"LOG: created file while online"
							);
							this.uploadNewNotesFile(e);
						}
						return;
					}

					this.writingFile = true;
					this.statusBarItem.classList.replace(
						"sync_icon_still",
						"sync_icon"
					);
					setIcon(this.statusBarItem, "sync");
					if (this.timer) clearTimeout(this.timer);
					this.timer = setTimeout(async () => {
						if (e instanceof TFile && e.extension == "md") {
							var buffer = await this.app.vault.readBinary(e);

							if (
								this.latestContentThatWasSynced != null &&
								bufferEqual(
									buffer,
									this.latestContentThatWasSynced
								)
							) {
								console.log(
									"ignoring modify trigger due to updation from getLatestContent"
								);
								this.statusBarItem.classList.replace(
									"sync_icon",
									"sync_icon_still"
								);
								setIcon(this.statusBarItem, "checkmark");
								this.writingFile = false;
								return;
							}
							let content = await this.app.vault.cachedRead(e);
							let timeStamp = content.match(/lastSync:.*/);
							if (timeStamp) {
								if (
									Math.abs(
										new Date(timeStamp[0]).getTime() -
											new Date(e.stat.mtime).getTime()
									) < 1000
								) {
									// same code repeated, deal with it later
									console.log(
										"ignoring modify trigger due to lastSyncTag updation"
									);
									this.statusBarItem.classList.replace(
										"sync_icon",
										"sync_icon_still"
									);
									setIcon(this.statusBarItem, "checkmark");
									this.writingFile = false;
									return;
								}
							}
							if (this.syncQueue.contains(e.path)) return;
							else this.syncQueue.push(e.path);
							await this.writeToVerboseLogFile(
								"LOG: modifying file while online"
							);
						}
						this.writingFile = false;
					}, 2500);
				} catch (err) {
					await this.notifyError();
					await this.checkForConnectivity();
					await this.writeToErrorLogFile(err);
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				if (file?.extension == "md") this.getLatestContent(file!);
			})
		);

		// This creates an icon in the left ribbon.
		const uploadEl = this.addRibbonIcon(
			"cloud",
			"Upload Current File",
			async () => {
				if (!this.connectedToInternet) {
					console.log(
						"ERROR: Connectivity lost, not uploading files to Google Drive..."
					);
					new Notice("ERROR: No connectivity!");
					return;
				}
				var file = this.app.workspace.getActiveFile()!;
				if (!this.cloudFiles.includes(file?.path!)) {
					new ConfirmUpload(this.app, async () => {
						// Called when the user clicks the icon.
						this.uploadNewNotesFile(file);
					}).open();
					return;
				}
				try {
					// Called when the user clicks the icon.
					new Notice("Uploading the current file to Google Drive!");
					var buffer: any = await this.app.vault.readBinary(
						this.app.workspace.getActiveFile()!
					);
					var id;
					this.settings.filesList.map((file: any) => {
						if (
							file.name ==
							this.app.workspace.getActiveFile()?.path
						) {
							id = file.id;
						}
					});
					var res = await modifyFile(
						this.settings.accessToken,
						id,
						buffer
					);
					new Notice("Uploaded!");
				} catch (err) {
					await this.notifyError();
					await this.checkForConnectivity();
					await this.writeToErrorLogFile(err);
				}
			}
		);
		const downloadEl = this.addRibbonIcon(
			"install",
			"Download Current File",
			async () => {
				if (!this.connectedToInternet) {
					console.log(
						"ERROR: Connectivity lost, not fetching files from Google Drive..."
					);
					new Notice("ERROR: No connectivity!");
					return;
				}
				var ufile = this.app.workspace.getActiveFile()!;
				if (!this.cloudFiles.includes(ufile?.path!)) {
					new Notice(
						"This file doesn't exist on Google Drive. Please upload it first."
					);
					return;
				}
				// Called when the user clicks the icon.
				new Notice("Downloading current file!");
				await this.getLatestContent(ufile, "forced");
				new Notice("Sync complete :)");
			}
		);

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "drive-upload-current",
			name: "Upload current file to Google Drive",
			callback: async () => {
				if (!this.connectedToInternet) {
					console.log(
						"ERROR: Connectivity lost, not uploading files to Google Drive..."
					);
					new Notice("ERROR: No connectivity!");
					return;
				}
				var file = this.app.workspace.getActiveFile()!;
				if (!this.cloudFiles.includes(file?.path!)) {
					new ConfirmUpload(this.app, async () => {
						// Called when the user clicks the icon.
						this.uploadNewNotesFile(file);
					}).open();
					return;
				}
				try {
					// Called when the user clicks the icon.
					new Notice("Uploading the current file to Google Drive!");
					var buffer: any = await this.app.vault.readBinary(
						this.app.workspace.getActiveFile()!
					);
					var id;
					this.settings.filesList.map((file: any) => {
						if (
							file.name ==
							this.app.workspace.getActiveFile()?.path
						) {
							id = file.id;
						}
					});
					var res = await modifyFile(
						this.settings.accessToken,
						id,
						buffer
					);
					new Notice("Uploaded!");
				} catch (err) {
					await this.notifyError();
					await this.checkForConnectivity();
					await this.writeToErrorLogFile(err);
				}
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "drive-download-current",
			name: "Download current file from Google Drive",
			callback: async () => {
				if (!this.connectedToInternet) {
					console.log(
						"ERROR: Connectivity lost, not fetching files from Google Drive..."
					);
					new Notice("ERROR: No connectivity!");
					return;
				}
				var ufile = this.app.workspace.getActiveFile()!;
				if (!this.cloudFiles.includes(ufile?.path!)) {
					new Notice(
						"This file doesn't exist on Google Drive. Please upload it first."
					);
					return;
				}
				// Called when the user clicks the icon.
				new Notice("Downloading current file!");
				await this.getLatestContent(ufile, "forced");
				new Notice("Sync complete :)");
			},
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class syncSettings extends PluginSettingTab {
	plugin: driveSyncPlugin;

	constructor(app: App, plugin: driveSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		/* header */
		const head = containerEl.createEl("h1", {
			// heading
			text: "Google Drive Sync",
			cls: "main",
		});

		const sync = containerEl.createEl("div", { cls: "container" });

		if (this.plugin.settings.validToken) {
			// if token is valid
			const sync_text = sync.createEl("div", {
				text: "Logged in",
				cls: "sync_text",
			});
			const sync_icons = sync.createDiv({ cls: "sync_icon_still" });
			setIcon(sync_icons, "checkmark");
		} else {
			// display login link
			const sync_link = sync.createEl("a", {
				text: "Open this link to log in",
				cls: "sync_text",
			});
			sync_link.href =
				"https://red-formula-303406.ue.r.appspot.com/auth/obsidian";
		}

		new Setting(containerEl)
			.setName("Enable Error logging")
			.setDesc("Error logs will appear in a .md file")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.errorLoggingToFile);
				toggle.onChange((val) => {
					this.plugin.settings.errorLoggingToFile = val;
					this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Enable Verbose logging")
			.setDesc("Verbose logs will appear in a .md file")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.verboseLoggingToFile);
				toggle.onChange((val) => {
					this.plugin.settings.verboseLoggingToFile = val;
					this.plugin.saveSettings();
				});
			});
		/* set refresh token input box */
		new Setting(containerEl)
			.setName("Set refresh token")
			.setDesc("Enter the refresh token you got from the link provided")
			.addText((text) =>
				text
					.setPlaceholder("Enter token")
					.setValue(this.plugin.settings.refreshToken)
					.onChange(async (value) => {
						this.plugin.settings.refreshToken = value;
					})
			)
			.addButton((button) =>
				button.setIcon("checkmark").onClick(async () => {
					await this.plugin.saveSettings(); // save refresh token

					sync.innerHTML = "";
					const sync_text = sync.createEl("div", {
						text: "Checking...",
						cls: "sync_text",
					});
					const sync_icons = sync.createDiv({ cls: "sync_icon" });
					setIcon(sync_icons, "sync");
					var res: any = await getAccessToken(
						this.plugin.settings.refreshToken
					); // check for accesstoken
					if (res != "error") {
						// display status accordingly
						this.plugin.settings.accessToken = res.access_token;
						this.plugin.settings.validToken = true;
						new Notice("Logged in successfully");
						sync.innerHTML = "";
						const sync_text = sync.createEl("div", {
							text: "Logged in",
							cls: "sync_text",
						});
						const sync_icons = sync.createDiv({
							cls: "sync_icon_still",
						});
						setIcon(sync_icons, "checkmark");
						new Notice("Please reload the plug-in", 5000);
					} else {
						this.plugin.settings.accessToken = "";
						this.plugin.settings.validToken = false;
						new Notice("Log in failed");
						sync.innerHTML = "";
						const sync_link = sync.createEl("a", {
							text: "Open this link to log in",
							cls: "sync_text",
						});
						sync_link.href =
							"https://red-formula-303406.ue.r.appspot.com/auth/obsidian";
					}
					this.plugin.saveSettings();
				})
			);
		if (!this.plugin.settings.validToken) return; // bodge 1
		if (!this.plugin.settings.vaultInit) {
			new Setting(containerEl)
				.setName("Initialize vault")
				.setDesc("Create vault and sync all files to Google Drive")
				.addButton((button) => {
					button.setButtonText("Proceed");
					button.onClick(
						async () => await this.plugin.cleanInstall()
					);
				});
			return;
		}
		new Setting(containerEl)
			.setName("Set refresh time")
			.setDesc(
				"Enter the time in seconds after which the plugin checks for changed content. [Reload required]"
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter time")
					.setValue(this.plugin.settings.refreshTime)
					.onChange(async (value) => {
						this.plugin.settings.refreshTime = value;
						this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Auto refresh binary files")
			.setDesc(
				"Experimental: Automatically fetch lastest binary files. Currently this plugin doesn't completely support binary file sync."
			)
			.addDropdown((selector) => {
				selector.addOption("1", "Fetch");
				selector.addOption("0", "Don't fetch");
				selector.setValue(this.plugin.settings.autoRefreshBinaryFiles);
				selector.onChange((val) => {
					this.plugin.settings.autoRefreshBinaryFiles = val;
					this.plugin.saveSettings();
				});
			});
		new Setting(containerEl)
			.setName("Upload all")
			.setDesc(
				"Upload all files to Google Drive, thus DELETING ALL PREVIOUS FILES"
			)
			.addButton((button) =>
				button.setIcon("cloud").onClick(async () => {
					new Notice("Clearing vault in Google Drive...");
					await deleteFile(
						this.plugin.settings.accessToken,
						this.plugin.settings.vaultId
					);
					await this.plugin.cleanInstall();
				})
			);
		new Setting(containerEl)
			.setName("Download all")
			.setDesc(
				"Download all files from Google Drive, thus DELETING ALL PREVIOUS FILES"
			)
			.addButton((button) =>
				button.setIcon("install").onClick(async () => {
					new Notice("Clearing vault...");
					var filesList = this.app.vault.getFiles();
					this.plugin.settings.refresh = true;
					for (const file of filesList) {
						this.app.vault.delete(file, true);
					}
					new Notice("Downloading files...");
					for (const file of this.plugin.settings.filesList) {
						//console.log(file);

						var res = await getFile(
							this.plugin.settings.accessToken,
							file.id
						);
						await this.app.vault
							.createBinary(res[0], res[1])
							.catch(async () => {
								var path = res[0]
									.split("/")
									.slice(0, -1)
									.join("/");
								//console.log(path);

								await this.app.vault.createFolder(path);
								await this.app.vault.createBinary(
									res[0],
									res[1]
								);
							});
					}
					this.plugin.settings.refresh = false;
					new Notice("Sync complete :)");
				})
			);
	}
}

export class ConfirmUpload extends Modal {
	onSubmit: () => void;

	constructor(app: App, onSubmit: () => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Wait a sec!" });

		new Setting(contentEl).setName(
			"Seems like this file is missing from Google Drive. Either it has been created recently or was deleted from your other devices. You can upload it to Google Drive or manually delete it :)"
		);

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Okay").onClick(() => {
					this.close();
				})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Upload")
					.setCta()
					.onClick(() => {
						//console.log(this.app.workspace.getActiveFile());
						this.close();
						this.onSubmit();
					})
			);
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}
}
