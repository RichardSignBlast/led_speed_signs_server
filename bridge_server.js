const net = require('net');

// Server configuration
const CLIENT_PORT = 8080;
const CLIENT_HOST = '0.0.0.0';

// Function to parse device messages
function parseDeviceMessage(message) {
  const hexString = message.toString('hex');
  const match = hexString.match(/a5(4350423431313032323300)6832ffed0110(474c474100)(303030303030)/);
  if (match) {
    return {
      deviceId: Buffer.from(match[1], 'hex').toString().slice(0, -1), // Remove the last null byte
      projectName: Buffer.from(match[2], 'hex').toString(),
      password: Buffer.from(match[3], 'hex').toString(),
      fullMessage: hexString
    };
  }
  return null;
}

// Function to send registration response
function sendRegistrationResponse(socket, deviceId) {
  const response = Buffer.from(`a54350423431313032323300e832ffed0010012f02ae`, 'hex');
  socket.write(response, (err) => {
    if (err) {
      console.error('Error sending registration response:', err);
    } else {
      console.log('Sent registration response to device:', response);
    }
  });
}

// Create the server for clients to connect to
const server = net.createServer((clientSocket) => {
  const clientInfo = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
  console.log(`Client connected: ${clientInfo}`);

  // Handle data from client
  clientSocket.on('data', (data) => {
    console.log(`Received data from client ${clientInfo}:`, data.toString('hex'));
    
    // Check if it's an HTTP request
    if (data.toString().startsWith('GET') || data.toString().startsWith('POST')) {
      console.log(`Received HTTP request from ${clientInfo}, ignoring`);
      clientSocket.end('HTTP/1.1 200 OK\r\n\r\nOK');
      return;
    }
    
    const parsedMessage = parseDeviceMessage(data);
    if (parsedMessage) {
      console.log(`Parsed message from ${clientInfo}:`, JSON.stringify(parsedMessage, null, 2));
      
      // Check registration (device ID and password)
      if (parsedMessage.deviceId === 'CPB4110223' && parsedMessage.password === '000000') {
        console.log(`Device ${parsedMessage.deviceId} attempting registration from ${clientInfo}`);
        sendRegistrationResponse(clientSocket, parsedMessage.deviceId + '00');
      } else {
        console.log(`Invalid device ID or password from ${clientInfo}`);
        // You might want to send a different response for failed registration
      }
    } else {
      console.log(`Unrecognized message format from ${clientInfo}`);
    }
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
