const net = require('net');

// Server configuration
const CLIENT_PORT = 8080;
const CLIENT_HOST = '0.0.0.0';

// LED Controller configuration
const LED_CONTROLLER_IP = '192.168.1.223';
const LED_CONTROLLER_PORT = 5200;

let ledControllerSocket = null;
let isShuttingDown = false;

// Function to parse device messages
function parseDeviceMessage(message) {
  // Convert buffer to hex string to handle non-printable characters
  const hexString = message.toString('hex');
  
  // Look for the pattern: CPB411 followed by 4 digits
  const match = hexString.match(/4350423431312e2e2e2e(.*)/);
  if (match) {
    const deviceId = 'CPB411' + match[1].substr(0, 8);
    const password = match[1].substr(8, 12);
    return {
      deviceId: deviceId,
      password: password,
      fullMessage: hexString
    };
  }
  return null;
}

// Function to send registration response
function sendRegistrationResponse(socket, success) {
  const response = success ? '0\n' : '1\n';
  socket.write(response);
  console.log('Sent registration response:', response.trim());
}

// Function to connect to LED Controller with retry mechanism
function connectToLEDController() {
  if (isShuttingDown) return;

  ledControllerSocket = new net.Socket();

  ledControllerSocket.connect(LED_CONTROLLER_PORT, LED_CONTROLLER_IP, () => {
    console.log('Connected to LED controller');
  });

  ledControllerSocket.on('error', (err) => {
    console.error('LED controller socket error:', err.message);
    ledControllerSocket.destroy();
  });

  ledControllerSocket.on('close', () => {
    console.log('LED controller connection closed. Attempting to reconnect...');
    setTimeout(connectToLEDController, 5000);
  });
}

// Create the server for clients to connect to
const server = net.createServer((clientSocket) => {
  console.log('Client connected:', clientSocket.remoteAddress);

  // Ensure LED controller connection
  if (!ledControllerSocket || ledControllerSocket.destroyed) {
    connectToLEDController();
  }

  // Handle data from client
  clientSocket.on('data', (data) => {
    console.log('Received from client:', data.toString('hex'));
    
    const parsedMessage = parseDeviceMessage(data);
    if (parsedMessage) {
      console.log('Parsed message:', JSON.stringify(parsedMessage, null, 2));
      
      // Check registration (device ID and password)
      if (parsedMessage.deviceId === 'CPB4110223' && parsedMessage.password === '000000') {
        console.log('Device registered successfully');
        sendRegistrationResponse(clientSocket, true);
        
        // Forward to LED controller if connected
        if (ledControllerSocket && ledControllerSocket.writable) {
          ledControllerSocket.write(data);
          console.log('Forwarded to LED controller');
        } else {
          console.log('LED controller socket not writable, buffering or handling locally');
          // Implement local handling or buffering here
        }
      } else {
        console.log('Invalid device ID or password');
        sendRegistrationResponse(clientSocket, false);
      }
    } else {
      console.log('Unrecognized message format');
    }
  });

  // Handle client disconnection
  clientSocket.on('close', () => {
    console.log('Client disconnected:', clientSocket.remoteAddress);
  });

  // Handle client errors
  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err.message);
  });
});

// Start the server
server.listen(CLIENT_PORT, CLIENT_HOST, () => {
  console.log(`Server listening on ${CLIENT_HOST}:${CLIENT_PORT}`);
  connectToLEDController(); // Initial connection attempt
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err.message);
});

// Handle process termination
process.on('SIGINT', () => {
  isShuttingDown = true;
  console.log('Shutting down server...');
  
  // Close the LED controller socket if it exists
  if (ledControllerSocket) {
    ledControllerSocket.destroy();
  }

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
