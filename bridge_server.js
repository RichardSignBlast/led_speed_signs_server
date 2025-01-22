const net = require('net');

// Server configuration
const CLIENT_PORT = 8080;
const CLIENT_HOST = '0.0.0.0';

// LED Controller configuration
const LED_CONTROLLER_IP = '192.168.1.223';
const LED_CONTROLLER_PORT = 5200;

// Function to connect to LED Controller with retry mechanism
function connectToLEDController() {
  const ledControllerSocket = new net.Socket();

  ledControllerSocket.connect(LED_CONTROLLER_PORT, LED_CONTROLLER_IP, () => {
    console.log('Connected to LED controller');
  });

  ledControllerSocket.on('error', (err) => {
    console.error('LED controller socket error:', err.message);
    console.error('Error details:', err);
    setTimeout(() => connectToLEDController(), 5000); // Retry after 5 seconds
  });

  ledControllerSocket.on('close', () => {
    console.log('LED controller connection closed. Attempting to reconnect...');
    setTimeout(() => connectToLEDController(), 5000);
  });

  return ledControllerSocket;
}

// Create the server for clients to connect to
const server = net.createServer((clientSocket) => {
  console.log('Client connected:', clientSocket.remoteAddress);

  const ledControllerSocket = connectToLEDController();

  // Forward data from client to LED controller
  clientSocket.on('data', (data) => {
    console.log('Received from client:', data.toString().trim());
    if (ledControllerSocket.writable) {
      ledControllerSocket.write(data);
    } else {
      console.log('LED controller socket not writable');
    }
  });

  // Forward data from LED controller to client
  ledControllerSocket.on('data', (data) => {
    console.log('Received from LED controller:', data.toString().trim());
    clientSocket.write(data);
  });

  // Handle client disconnection
  clientSocket.on('close', () => {
    console.log('Client disconnected:', clientSocket.remoteAddress);
    ledControllerSocket.destroy();
  });

  // Handle client errors
  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err.message);
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
    console.log('Server shut down');
    process.exit(0);
  });
});
