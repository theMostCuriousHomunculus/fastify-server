import fastify_static from '@fastify/static';
import Fastify from 'fastify';
import socketioServer from 'fastify-socket.io';
// import fastify_websocket from '@fastify/websocket';
import path from 'path';

const fastify = Fastify();

fastify.register(socketioServer);

// server.register(fastify_websocket);

fastify.register(
	fastify_static,
	{	root: path.join(__dirname, '../public') },
);

const rooms = {};

fastify.ready((err) => {
	if (err) throw err;

	fastify
		.io
		.on(
			'connection',
			(socket) => {
					fastify
						.io
						.on(
							'answer',
							(payload) => {
								fastify
									.io
									.to(payload.target)
									.emit(
										'answer',
										payload,
									);
							},
						);

					fastify
						.io
						.on(
							'ice-candidate',
							(incoming) => {
								fastify
									.io
									.to(incoming.target)
									.emit(
										'ice-candidate',
										{
											candidate: incoming.candidate,
											origin: incoming.origin,
										},
									);
							},
						);

					fastify
						.io
						.on(
							'join room',
							(roomID) => {
								if (rooms[roomID]) {
									rooms[roomID].push(socket.id);
								} else {
									rooms[roomID] = [socket.id];
								}

								const otherUser = rooms[roomID].find((socketID) => socketID !== socket.id);

								if (otherUser) {
									socket.emit('other user', otherUser);
									socket.to(otherUser).emit('user joined', socket.id);
								}
							},
						);

					fastify
						.io
						.on(
							'offer',
							(payload) => {
								fastify
									.io
									.to(payload.target)
									.emit(
										'offer',
										payload,
									);
							},
						);
			},
		);
});

// server.register(async function (server) {
// 	server.route({
// 		handler: (req, reply) => {
// 			reply.sendFile('index.html');
// 		},
// 		method: 'GET',
// 		url: '/',
// 		wsHandler: (connection, req) => {
// 			// connection.setEncoding('utf8');
// 			connection.socket.
// 			broadcast({
// 				sender: '__server',
// 				message: `${(req.query as { username: string }).username} joined`,
// 			});

// 			connection.socket.on('close', () => {
// 				broadcast({
// 					sender: '__server',
// 					message: `${(req.query as { username: string }).username} left`,
// 				});
// 			});

// 			connection.socket.on('message', (message: string) => {
// 				broadcast({
// 					sender: (req.query as { username: string }).username,
// 					...JSON.parse(message),
// 				});
// 			});

// 			// connection.once('data', chunk => {
// 			// 	connection.end();
// 			// });
// 		}
// 	})
// });

// server.register(async function (server) {
// 	server.get('/', { websocket: true }, (connection, req) => {
// 		broadcast({
// 			sender: '__server',
// 			message: `${(req.query as { username: string }).username} joined`,
// 		});

// 		connection.socket.on('close', () => {
// 			broadcast({
// 				sender: '__server',
// 				message: `${(req.query as { username: string }).username} left`,
// 			});
// 		});

// 		connection.socket.on('message', (message: string) => {
// 			broadcast({
// 				sender: (req.query as { username: string }).username,
// 				...JSON.parse(message),
// 			});
// 		});
// 	});
// });

(async () => {
	try {
		await fastify.listen({ port: 6969 });
		console.log('Fastify listening on port 6969!');
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
})();

// function broadcast(message: object) {
// 	for(let client of server.websocketServer.clients) {
// 		client.send(JSON.stringify(message));
// 	}
// }
