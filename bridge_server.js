const net = require('net');
const express = require('express');
const bodyParser = require('body-parser');

// Server configuration
const TCP_PORT = 8080;
const TCP_HOST = '0.0.0.0';
const HTTP_PORT = 3000;

function getTimestamp() {
    return new Date().toISOString();
}

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
        console.log(`${getTimestamp()} ${clientInfo} -> ${TCP_HOST}:${TCP_PORT}: Received short message (possibly broadcast): ${receivedData.toString('hex')}`);
        return; // Don't respond to short messages
    }

    const messageType = receivedData[15].toString(16).padStart(2, '0').toUpperCase();
    const deviceId = receivedData.slice(1, 12).toString('hex');

    let response;
    if (messageType === '10') {  // Registration message
        response = 'a54350423431313032323300e832ffed0010001603ae';
    } else if (messageType === '12') {  // Heartbeat message
        const heartbeatIndex = receivedData[17].toString(16).padStart(2, '0').toUpperCase();
        response = generatePacket(deviceId, 'E8', '12', heartbeatIndex, []);
    } else {
        console.log(`${getTimestamp()} ${clientInfo} -> ${TCP_HOST}:${TCP_PORT}: Received unknown message type: ${messageType}`);
        return; // Don't respond to unknown message types
    }

    socket.write(Buffer.from(response, 'hex'), (err) => {
        if (err) {
            console.error(`${getTimestamp()} Error sending response to ${clientInfo}:`, err);
        } else {
            console.log(`${getTimestamp()} ${clientInfo} <- ${TCP_HOST}:${TCP_PORT}: ${response}`);
        }
    });
}

// Store connected clients
const clients = new Set();

// Create the TCP server for clients to connect to
const tcpServer = net.createServer((clientSocket) => {
    const clientInfo = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
    console.log(`${getTimestamp()} Client connected: ${clientInfo}`);
    
    clients.add(clientSocket);

    // Handle data from client
    clientSocket.on('data', (data) => {
        console.log(`${getTimestamp()} ${clientInfo} -> ${TCP_HOST}:${TCP_PORT}: ${data.toString('hex')}`);
        
        try {
            sendResponse(clientSocket, clientInfo, data);
        } catch (error) {
            console.error(`${getTimestamp()} Error processing message from ${clientInfo}:`, error);
        }
    });

    // Handle client disconnection
    clientSocket.on('close', () => {
        console.log(`${getTimestamp()} Client disconnected: ${clientInfo}`);
        clients.delete(clientSocket);
    });

    // Handle client errors
    clientSocket.on('error', (err) => {
        console.error(`${getTimestamp()} Client socket error for ${clientInfo}:`, err.message);
        clients.delete(clientSocket);
    });
});

// Start the TCP server
tcpServer.listen(TCP_PORT, TCP_HOST, () => {
    console.log(`${getTimestamp()} TCP Server listening on ${TCP_HOST}:${TCP_PORT}`);
});

// Create the HTTP server using Express
const app = express();
app.use(bodyParser.text({ type: '*/*' }));

// POST route for sending messages to all connected clients
app.post('/send', (req, res) => {
    const message = req.body;
    console.log(`${getTimestamp()} Received POST request with message: ${message}`);
    
    if (!/^[0-9A-Fa-f]+$/.test(message)) {
        return res.status(400).json({ error: 'Invalid hexadecimal message' });
    }

    const buffer = Buffer.from(message, 'hex');
    
    clients.forEach(client => {
        client.write(buffer, (err) => {
            if (err) {
                console.error(`${getTimestamp()} Error sending message to client:`, err);
            } else {
                console.log(`${getTimestamp()} Message sent to client: ${client.remoteAddress}:${client.remotePort}`);
            }
        });
    });

    res.json({ message: 'Message sent to all connected clients', clientCount: clients.size });
});

// Start the HTTP server
app.listen(HTTP_PORT, () => {
    console.log(`${getTimestamp()} HTTP Server listening on port ${HTTP_PORT}`);
});

// Handle process termination for both servers
process.on('SIGINT', () => {
    console.log('Shutting down servers...');
    tcpServer.close(() => {
        console.log('TCP Server shut down gracefully');
    });
    app.close(() => {
        console.log('HTTP Server shut down gracefully');
        process.exit(0);
    });

    // Force shutdown after 5 seconds if not closed gracefully
    setTimeout(() => {
        console.log('Force shutting down...');
        process.exit(1);
    }, 5000);
});
