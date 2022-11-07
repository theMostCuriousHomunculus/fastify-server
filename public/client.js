const cameraVideo = document.getElementById('camera-video');
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
			console.log(peers);
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

