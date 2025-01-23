const net = require('net');

// Server configuration
const CLIENT_PORT = 8080;
const CLIENT_HOST = '0.0.0.0';

function sendRegistrationResponse(socket, receivedData) {
  // Convert the first 11 bytes (device name) to a string
  const deviceName = receivedData.slice(1, 12).toString('ascii').replace(/\0+$/, '');

  const responseData = Buffer.from([
    0xa5,  // Start byte
    ...receivedData.slice(1, 12),  // Device name with null terminator
    0xe8, 0x32, 0xff, 0xed, 0x01, 0x10,  // Fixed part
    ...receivedData.slice(18, 23),  // Project name
    ...receivedData.slice(23, 29),  // Password
    ...receivedData.slice(1, 12),  // Repeat device name
    0x04, 0x07, 0xae  // Checksum and end byte
  ]);

  socket.write(responseData, (err) => {
    if (err) {
      console.error('Error sending registration response:', err);
    } else {
      console.log('Sent registration response to device:', responseData.toString('hex'));
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
    
    // Send response immediately without any checks
    sendRegistrationResponse(clientSocket, data);
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
