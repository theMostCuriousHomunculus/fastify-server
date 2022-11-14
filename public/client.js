const cameraVideo = document.getElementById('camera-video');
const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const fileShareButton = document.getElementById('file-share-button');
const fileShareButtonOnClickHandler = (clickEvent) => {
	for (let i = 0; i < fileShareInput.files.length; i++) {
		const file = fileShareInput
			.files
			.item(i);
		const reader = file
			.stream()
			.getReader();
		reader
			.read()
			.then(
				(chunk) => handleStreamChunk(chunk),
			);

		const handleStreamChunk = ({
			done,
			value,
		}) => {
			// Object.entries(peers)...
			if (done) {
				peers[userID]
					.camera
					.write(
						JSON.stringify({
							done: true,
							fileName: file.name,
						}),
					);
				return;
			}

			peers[userID]
				.camera
				.write(value);
			reader
				.read()
				.then(
					(chunk) => handleStreamChunk(chunk),
				);
		};
	}
};
const fileShareContainer = document.getElementById('file-share-container');
const fileShareInput = document.getElementById('file-share-input');
const peers = {};
const screenShareButton = document.getElementById('screen-share-button');
const servers = {
	iceServers: [
		{
			urls: [
				'stun:stun1.l.google.com:19302',
				'stun:stun2.l.google.com:19302',
				'stun:stun3.l.google.com:19302',
				'stun:stun4.l.google.com:19302',
			],
		},
	],
};
const socket = io();
const videos = document.getElementById('videos');
const worker = new Worker('./worker.js');

const createPeer = (userID, source) => {
	peers[userID] = peers[userID] ?? {};
	peers[userID][source] = new RTCPeerConnection(servers);

	peers[userID][source].onicecandidate = (rtcPeerConnectionIceEvent) => {
		if (rtcPeerConnectionIceEvent.candidate) {
			socket.emit(
				'ice-candidate',
				{
					candidate: rtcPeerConnectionIceEvent.candidate,
					source,
					target: userID,
				},
			);
		}
	};

	peers[userID][source].onnegotiationneeded = () => {
		peers[userID][source].createOffer()
			.then((offer) => peers[userID][source].setLocalDescription(offer))
			.then(() => {
				socket.emit(
					'offer',
					{
						sdp: peers[userID][source].localDescription,
						source,
						target: userID,
					},
				);
			})
			.catch((error) => console.log(error));
	};

	peers[userID][source].ontrack = (rtcTrackEvent) => {
		if (rtcTrackEvent.track.kind === 'video') {
			const newVideo = document.createElement('video');
			newVideo.setAttribute('autoplay', 'true');
			newVideo.setAttribute('controls', 'true');
			newVideo.classList.add(userID, source);
			newVideo.setAttribute('playsinline', 'true');
			newVideo.srcObject = rtcTrackEvent.streams[0];
			const newVideoContainer = document.createElement('div');
			newVideoContainer.classList.add('video-container');
			newVideoContainer.appendChild(newVideo);
			const existingVideos = document.getElementsByClassName(userID);
	
			if (existingVideos.length > 1) {
				existingVideos[existingVideos.length - 2].parentElement.after(newVideoContainer);
			} else {
				videos.appendChild(newVideoContainer);
			}
		}

		rtcTrackEvent.track.onmute = () => {
			delete peers[userID][source];
			const videoToRemove = document.getElementsByClassName(`${userID} ${source}`);
			if (videoToRemove) {
				videoToRemove[0].parentElement.parentElement.removeChild(videoToRemove[0].parentElement);
			}
			if (Object.entries(peers[userID]).length === 0) {
				delete peers[userID];
			}
		};
	};
};

screenShareButton.addEventListener(
	'click',
	async () => {
		const stream = await navigator.mediaDevices.getDisplayMedia({ cursor: true });
		Object.keys(peers).forEach((userID) => createPeer(userID, 'screen'));
		Object.values(peers).forEach((peer) => {
			peer.screen.addTrack(stream.getVideoTracks()[0], stream);
		});
	},
);

const handleIncomingChatMessage = (event) => {
	const newMessage = document.createElement('div');
	newMessage.classList.add('received');
	newMessage.innerText = event.data;
	chatHistory.appendChild(newMessage);
};

const handleIncomingFileMessage = (event) => {
	if (event.data.toString().includes('done')) {
		// show the download button
		const downloadButton = document.createElement('button');
		const fileName = JSON.parse(event.data).fileName;
		downloadButton.innerText = `Download ${fileName}`;
		downloadButton.addEventListener(
			'click',
			() => {
				worker.postMessage('download');
				worker.addEventListener(
					'message',
					(messageEvent) => {
						const stream = messageEvent.data.stream();
						const fileStream = window.streamSaver.createWriteStream(fileName);
						stream.pipeTo(fileStream);
					},
				);
				downloadButton.remove();
			},
		);
		fileShareContainer.appendChild(downloadButton);
	} else {
		worker.postMessage(event.data);
	}
};

(async () => {
	const stream = await navigator
		.mediaDevices
		.getUserMedia({
			audio: true,
			video: true,
		});

	cameraVideo.srcObject = stream;

	socket.connect();
	socket.emit('join room', 'abc');

	socket.on(
		'another user disconnected',
		(userID) => {
			delete peers[userID];
			const videosToRemove = document.getElementsByClassName(userID);
			while (videosToRemove.length) {
				videosToRemove[0].parentElement.parentElement.removeChild(videosToRemove[0].parentElement);
			}
		},
	);

	socket.on(
		'another user joined',
		(userID) => {
			createPeer(userID, 'camera');
			const chatChannel = peers[userID].camera.createDataChannel('chat');
			chatChannel.onmessage = handleIncomingChatMessage;
			chatInput.addEventListener(
				'keydown',
				(keydownEvent) => {
					if (keydownEvent.key === 'Enter' && !keydownEvent.shiftKey) {
						chatChannel.send(chatInput.value);
						const newMessage = document.createElement('div');
						newMessage.classList.add('sent');
						newMessage.innerText = chatInput.value;
						chatHistory.appendChild(newMessage);
						chatInput.value = '';
					}
				},
			);
			const fileChannel = peers[userID].camera.createDataChannel('file');
			fileChannel.onmessage = handleIncomingFileMessage;
			fileShareButton.addEventListener(
				'click',
				fileShareButtonOnClickHandler,
			);
			stream.getTracks().forEach((track) => peers[userID].camera.addTrack(track, stream));
		},
	);

	socket.on(
		'offer',
		({
			caller,
			sdp,
			source,
		}) => {
			createPeer(caller, source);
			if (source === 'camera') {
				peers[caller].camera.ondatachannel = (dataChannelEvent) => {
					if (dataChannelEvent.channel.label === 'chat') {
						dataChannelEvent.channel.onmessage = handleIncomingChatMessage;
						chatInput.addEventListener(
							'keydown',
							(keydownEvent) => {
								if (keydownEvent.key === 'Enter' && !keydownEvent.shiftKey) {
									dataChannelEvent.channel.send(chatInput.value);
									const newMessage = document.createElement('div');
									newMessage.classList.add('sent');
									newMessage.innerText = chatInput.value;
									chatHistory.appendChild(newMessage);
									chatInput.value = '';
								}
							},
						);
					}

					if (dataChannelEvent.channel.label === 'file') {
						dataChannelEvent.channel.onmessage = handleIncomingFileMessage;
						fileShareButton.addEventListener(
							'click',
							fileShareButtonOnClickHandler,
						)
					}
				}
			}
			const description = new RTCSessionDescription(sdp);
			peers[caller][source].setRemoteDescription(description)
				.then(() => {
					if (source === 'camera') {
						stream.getTracks().forEach((track) => peers[caller][source].addTrack(track, stream));
					}
				})
				.then(() => peers[caller][source].createAnswer())
				.then((answer) => peers[caller][source].setLocalDescription(answer))
				.then(() => {
					socket.emit(
						'answer',
						{
							sdp: peers[caller][source].localDescription,
							target: caller,
							source,
						},
					);
				});
		},
	);
		
	socket.on(
		'answer',
		({
			caller,
			sdp,
			source,
		}) => {
			peers[caller][source].setRemoteDescription(new RTCSessionDescription(sdp));
		},
	);

	socket.on(
		'ice-candidate',
		({
			candidate,
			origin,
			source,
		}) => {
			peers[origin][source].addIceCandidate(new RTCIceCandidate(candidate));
		},
	);
})();

