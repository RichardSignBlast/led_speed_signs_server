const net = require('net');

// Server configuration
const CLIENT_PORT = 8080;
const CLIENT_HOST = '0.0.0.0';

function sendRegistrationResponse(socket, clientInfo) {
  const response = Buffer.from('a54350423431313032323300e832ffed01100031fdae', 'hex');

  socket.write(response, (err) => {
    if (err) {
      console.error(`Error sending registration response to ${clientInfo}:`, err);
    } else {
      console.log(`${clientInfo} <- ${CLIENT_HOST}:${CLIENT_PORT}: ${response.toString('hex')}`);
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
    
    // Send response immediately without any checks
    sendRegistrationResponse(clientSocket, clientInfo);
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
