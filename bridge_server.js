const net = require('net');

// Server configuration
const CLIENT_PORT = 8080;
const CLIENT_HOST = '0.0.0.0';

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
    const messageType = receivedData[17].toString(16).padStart(2, '0').toUpperCase();
    const deviceId = receivedData.slice(1, 12).toString('hex');

    let response;
    if (messageType === '10') {  // Registration message
        response = 'a54350423431313032323300e832ffed0010001603ae';
    } else if (messageType === '12') {  // Heartbeat message
        const heartbeatIndex = receivedData[17].toString(16).padStart(2, '0').toUpperCase();
        response = generatePacket(deviceId, 'E8', '12', heartbeatIndex, []);
    }

    socket.write(Buffer.from(response, 'hex'), (err) => {
        if (err) {
            console.error(`Error sending response to ${clientInfo}:`, err);
        } else {
            console.log(`${clientInfo} <- ${CLIENT_HOST}:${CLIENT_PORT}: ${response}`);
        }
    });
}


// Create the server for clients to connect to
const server = net.createServer((clientSocket) => {
    const clientInfo = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
    console.log(`Client connected: ${clientInfo}`);

    // Handle data from client
    clientSocket.on('data', (data) => {
        console.log(`${clientInfo} -> ${CLIENT_HOST}:${CLIENT_PORT}: ${data.toString('hex')}`);
        
        // Send response based on the received message
        sendResponse(clientSocket, clientInfo, data);
    });

    // Handle client disconnection
    clientSocket.on('close', () => {
        console.log(`Client disconnected: ${clientInfo}`);
    });

    // Handle client errors
    clientSocket.on('error', (err) => {
        console.error(`Client socket error for ${clientInfo}:`, err.message);
    });
});

// Start the server
server.listen(CLIENT_PORT, CLIENT_HOST, () => {
    console.log(`Server listening on ${CLIENT_HOST}:${CLIENT_PORT}`);
});

// Handle server errors
server.on('error', (err) => {
    console.error('Server error:', err.message);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server shut down gracefully');
        process.exit(0);
    });

    // Force shutdown after 5 seconds if not closed gracefully
    setTimeout(() => {
        console.log('Force shutting down...');
        process.exit(1);
    }, 5000);
});
