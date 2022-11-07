import fastify_static from '@fastify/static';
import Fastify from 'fastify';
import socketioServer from 'fastify-socket.io';
import path from 'path';

const fastify = Fastify();

fastify.register(socketioServer);

fastify.register(
	fastify_static,
	{	root: path.join(__dirname, '../public') },
);

(async () => {
	await fastify.ready();
	fastify
		.io
		.on(
			'connection',
			(socket) => {
				socket
					.on(
						'answer',
						({
							sdp,
							source,
							target,
						}) => {
							fastify
								.io
								.to(target)
								.emit(
									'answer',
									{
										caller: socket.id,
										source,
										sdp,
									},
								);
						},
					);

				socket
					.on(
						'disconnecting',
						() => {
							socket
								.rooms
								.forEach(
									(roomID) => {
										socket
										.to(roomID)
										.emit(
											'another user disconnected',
											socket.id,
										);
									},
								);
						}
					);

				socket
					.on(
						'ice-candidate',
						({
							candidate,
							source,
							target,
						}) => {
							fastify
								.io
								.to(target)
								.emit(
									'ice-candidate',
									{
										candidate,
										origin: socket.id,
										source,
									},
								);
						},
					);

				socket
					.on(
						'join room',
						(roomID) => {
							socket.join(roomID);
							socket
								.to(roomID)
								.emit(
									'another user joined',
									socket.id,
								);
						},
					);

				socket
					.on(
						'offer',
						({
							sdp,
							source,
							target,
						}) => {
							fastify
								.io
								.to(target)
								.emit(
									'offer',
									{
										caller: socket.id,
										sdp,
										source,
									},
								);
						},
					);
			},
		);
})();

(async () => {
	try {
		await fastify.listen({ port: 6969 });
		console.log('Fastify listening on port 6969!');
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
})();
