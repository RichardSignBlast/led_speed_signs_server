const net = require('net');
const http = require('http');
const url = require('url');

// Server configuration
const TCP_PORT = 8080;
const HTTP_PORT = 3000;
const HOST = '0.0.0.0';

// Store connected clients
const connectedClients = new Map();

function calculateChecksums(data) {
    const numericData = data.map(byte => {
        if (typeof byte === 'string') {
            return parseInt(byte, 16);
        }
        return byte;
    });

    const sum = numericData.reduce((acc, byte) => acc + byte, 0) & 0xFFFF;
    const low = sum & 0xFF;
    const high = (sum >> 8) & 0xFF;
  
    return [low, high];
}

function generatePacket(deviceId, boardId, command, additional, payload) {
    const dataForChecksum = [
        '32', 
        boardId, 
        command, 
        additional, 
        ...payload
    ];

    const checksums = calculateChecksums(dataForChecksum);

    const packet = [
        'A5',       // Head
        ...deviceId,
        '00',       // Null terminator for device ID
        boardId,    // Board ID (e8 for response)
        '32',       // Board Type
        'FF',       // Fixed
        'ED',       // Fixed
        '00',       // Fixed
        command,
        additional,
        ...payload,
        checksums[0].toString(16).padStart(2, '0').toUpperCase(),
        checksums[1].toString(16).padStart(2, '0').toUpperCase(),
        'AE'        // Tail
    ];

    return packet.join('');
}

function sendResponse(socket, clientInfo, receivedData) {
    if (receivedData.length < 16) {
        console.log(`${clientInfo} -> ${HOST}:${TCP_PORT}: Received short message (possibly broadcast): ${receivedData.toString('hex')}`);
        return; // Don't respond to short messages
    }

    const messageType = receivedData[17].toString(16).padStart(2, '0').toUpperCase();
    const deviceId = receivedData.slice(1, 12).toString('hex');

    let response;
    if (messageType === '10') {  // Registration message
        response = 'a54350423431313032323300e832ffed0010001603ae';
    } else if (messageType === '12') {  // Heartbeat message
        const heartbeatIndex = receivedData[19].toString(16).padStart(2, '0').toUpperCase();
        response = generatePacket(deviceId, 'E8', '12', heartbeatIndex, []);
    } else {
        console.log(`${clientInfo} -> ${HOST}:${TCP_PORT}: Received unknown message type: ${messageType}`);
        return; // Don't respond to unknown message types
    }

    socket.write(Buffer.from(response, 'hex'), (err) => {
        if (err) {
            console.error(`Error sending response to ${clientInfo}:`, err);
        } else {
            console.log(`${clientInfo} <- ${HOST}:${TCP_PORT}: ${response}`);
        }
    });
}

// Create the TCP server for devices to connect to
const tcpServer = net.createServer((clientSocket) => {
    const clientInfo = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
    console.log(`Client connected: ${clientInfo}`);

    // Store the client connection
    connectedClients.set(clientInfo, clientSocket);

    // Handle data from client
    clientSocket.on('data', (data) => {
        console.log(`${clientInfo} -> ${HOST}:${TCP_PORT}: ${data.toString('hex')}`);
        
        try {
            sendResponse(clientSocket, clientInfo, data);
        } catch (error) {
            console.error(`Error processing message from ${clientInfo}:`, error);
        }
    });

    // Handle client disconnection
    clientSocket.on('close', () => {
        console.log(`Client disconnected: ${clientInfo}`);
        connectedClients.delete(clientInfo);
    });

    // Handle client errors
    clientSocket.on('error', (err) => {
        console.error(`Client socket error for ${clientInfo}:`, err.message);
        connectedClients.delete(clientInfo);
    });
});

// Create the HTTP server for receiving POST requests
const httpServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/send') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { deviceId, message } = JSON.parse(body);
                const client = Array.from(connectedClients.entries()).find(([_, socket]) => {
                    return socket.remoteAddress === deviceId;
                });

                if (client) {
                    const [clientInfo, socket] = client;
                    const hexMessage = Buffer.from(message, 'hex');
                    socket.write(hexMessage, (err) => {
                        if (err) {
                            console.error(`Error sending message to ${clientInfo}:`, err);
                            res.writeHead(500);
                            res.end('Error sending message to device');
                        } else {
                            console.log(`${clientInfo} <- ${HOST}:${TCP_PORT}: ${message}`);
                            res.writeHead(200);
                            res.end('Message sent successfully');
                        }
                    });
                } else {
                    res.writeHead(404);
                    res.end('Device not found');
                }
            } catch (error) {
                console.error('Error processing POST request:', error);
                res.writeHead(400);
                res.end('Invalid request');
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// Start the TCP server
tcpServer.listen(TCP_PORT, HOST, () => {
    console.log(`TCP Server listening on ${HOST}:${TCP_PORT}`);
});

// Start the HTTP server
httpServer.listen(HTTP_PORT, HOST, () => {
    console.log(`HTTP Server listening on ${HOST}:${HTTP_PORT}`);
});

// Handle server errors
tcpServer.on('error', (err) => {
    console.error('TCP Server error:', err.message);
});

httpServer.on('error', (err) => {
    console.error('HTTP Server error:', err.message);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down servers...');
    tcpServer.close(() => {
        httpServer.close(() => {
            console.log('Servers shut down gracefully');
            process.exit(0);
        });
    });

    // Force shutdown after 5 seconds if not closed gracefully
    setTimeout(() => {
        console.log('Force shutting down...');
        process.exit(1);
    }, 5000);
});
