import { requestUrl } from "obsidian";

const getVaultId = async (accessToken, vault, root = null) => {
	const response = await requestUrl({
		url:
			"https://www.googleapis.com/drive/v3/files?q=mimeType%20%3D%20'application%2Fvnd.google-apps.folder'" +
			(root != null ? `%20and%20'${root}'%20in%20parents` : ""),
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	}).catch((e) => console.log(e));
	const list = response.json.files;
	var vaultFolder = list.filter((file) => file.name == vault);
	var vaultId = vaultFolder.length ? vaultFolder[0].id : "NOT FOUND";
	return vaultId;
};

const uploadFile = async (
	accessToken,
	fileName,
	buffer = null,
	parentId = null
) => {
	const response = await requestUrl({
		url: "https://www.googleapis.com/drive/v3/files?uploadType=multipart",
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},

		body: JSON.stringify({
			//mimeType: "text/pain",
			name: fileName,
			parents: parentId ? [parentId] : [],
		}),
	}).catch((e) => console.log(e));
	var id = response.json.id;
	if (buffer) {
		// upload the metadata
		await requestUrl({
			url: `https://www.googleapis.com/upload/drive/v3/files/${id}`,
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},

			body: buffer,
		}).catch((e) => console.log(e));
	}
	return id;
};

const modifyFile = async (accessToken, fileId, buffer) => {
	var res = await requestUrl({
		url: `https://www.googleapis.com/upload/drive/v3/files/${fileId}`,
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},

		body: buffer,
	}).catch((e) => console.log(e));
	return res;
};
const renameFile = async (accessToken, fileId, newName) => {
	const response = await requestUrl({
		url: `https://www.googleapis.com/drive/v3/files/${fileId}`,
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},

		body: JSON.stringify({
			name: newName,
		}),
	}).catch((e) => console.log(e));
	var id = response.json.id;
	return id;
};

const deleteFile = async (accessToken, fileId) => {
	const response = await requestUrl({
		url: `https://www.googleapis.com/drive/v3/files/${fileId}`,
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
	}).catch((e) => console.log(e));
};

const uploadFolder = async (accessToken, foldername, rootId = null) => {
	const response = await requestUrl({
		url: "https://www.googleapis.com/drive/v3/files?uploadType=multipart",
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},

		body: JSON.stringify({
			mimeType: "application/vnd.google-apps.folder",
			name: foldername,
			parents: rootId ? [rootId] : [],
		}),
	}).catch((e) => console.log(e));

	var id = response.json.id;
	return id;
};

const getFilesList = async (accessToken, vault) => {
	const response = await requestUrl({
		url:
			"https://www.googleapis.com/drive/v3/files" +
			(vault != null ? `?q='${vault}'%20in%20parents` : ""),
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});
	return response.json.files;
};

const getFoldersList = async (accessToken, vault = null) => {
	const response = await requestUrl({
		url:
			"https://www.googleapis.com/drive/v3/files?q=mimeType%20%3D%20'application%2Fvnd.google-apps.folder'" +
			(vault != null ? `%20and%20'${vault}'%20in%20parents` : ""),
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});
	return response.json.files;
};
const getFile = async (accessToken, fileId) => {
	const responseBuffer = await requestUrl({
		url:
			"https://www.googleapis.com/drive/v3/files/" +
			fileId +
			"?alt=media",

		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});
	const responseName = await requestUrl({
		url: "https://www.googleapis.com/drive/v3/files/" + fileId,

		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});
	return [responseName.json.name, responseBuffer.arrayBuffer];
};
export {
	getVaultId,
	getFilesList,
	getFoldersList,
	uploadFile,
	uploadFolder,
	getFile,
	renameFile,
	deleteFile,
	modifyFile,
};
