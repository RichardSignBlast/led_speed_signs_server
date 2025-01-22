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
  const hexString = message.toString('hex');
  console.log('Hex received:', hexString);

  // Look for the pattern: a5 followed by the device MAC address
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
  const response = Buffer.from(`a54350423431313032323300e832ffed0110013002ae`, 'hex');
  socket.write(response);
  console.log('Sent registration response:', response.toString('hex'));
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
        sendRegistrationResponse(clientSocket, parsedMessage.deviceId + '00');
        
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
        // You might want to send a different response for failed registration
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
