const localVideo = document.getElementById('local-video');
const peers = {};
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

socket.connect('/abc');
socket.emit('join room', 'abc');

const localStream = (async () => {
	return await navigator
		.mediaDevices
		.getUserMedia({
			audio: true,
			video: true,
		});
})();

socket.on(
	'other user',
	(userID) => {
		peers[userID] = new RTCPeerConnection(servers);

		peers[userID].onicecandidate = (rtcPeerConnectionIceEvent) => {
			if (rtcPeerConnectionIceEvent.candidate) {
				socket.emit('ice-candidate', {
					candidate: rtcPeerConnectionIceEvent.candidate,
					origin: socket.id,
					target: userID,
				});
			}
		};

		peers[userID].ontrack = (rtcTrackEvent) => {
			const existingVideo = document.getElementById(userID);
			if (existingVideo) {
				existingVideo.srcObject = rtcTrackEvent.streams[0];
			} else {
				document.getElementById('videos').innerHTML += `
					<li>
						<video autoplay id="${userID}" playsinline>
						</video>
					</li>
				`;
				document.getElementById(userID).srcObject = rtcTrackEvent.streams[0];
			}
		};

		peers[userID].onnegotiationneeded = peers[userID].createOffer()
			.then((offer) => peers[userID].setLocalDescription(offer))
			.then(() => {
				socket.emit(
					'offer',
					{
						target: userID,
						caller: socket.id,
						sdp: peers[userID].localDescription,
					},
				);
			})
			.catch((error) => console.log(error));

		localStream.getTracks().forEach((track) => peers[userID].addTrack(track, localStream));
	},
);

socket.on(
	'offer',
	(incoming) => {
		peers[incoming.caller] = new RTCPeerConnection(servers);
		const description = new RTCSessionDescription(incoming.sdp);
		peers[incoming.caller].setRemoteDescription(description)
			.then(() => localStream.getTracks().forEach((track) => peers[incoming.caller].addTrack(track, localStream)))
			.then(() => peers[incoming.caller].createAnswer())
			.then((answer) => peers[incoming.caller].setLocalDescription(answer))
			.then(() => {
				socket.emit(
					'answer',
					{
						target: incoming.caller,
						caller: socket.id,
						sdp: peers[incoming.caller].localDescription,
					},
				);
			});
	},
);

socket.on('answer', (answer) => peers[answer.caller].setRemoteDescription(new RTCSessionDescription(answer.sdp)));
socket.on('ice-candidate', (incoming) => peers[incoming.origin].addIceCandidate(new RTCIceCandidate(incoming.candidate)));

localVideo.srcObject = localStream;
