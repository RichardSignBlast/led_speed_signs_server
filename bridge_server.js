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
  const regex = /CPB411(\d{4})h2.(GLGA)(\d{6})/;
  const match = message.match(regex);
  if (match) {
    return {
      deviceId: `CPB411${match[1]}`,
      projectName: match[2],
      password: match[3],
      fullMessage: message.trim()
    };
  }
  return null;
}

// Function to send heartbeat response
function sendHeartbeatResponse(socket, deviceId) {
  const response = `ACK:${deviceId}\n`;
  socket.write(response);
  console.log('Sent heartbeat response:', response.trim());
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
    const message = data.toString().trim();
    console.log('Received from client:', message);
    
    const parsedMessage = parseDeviceMessage(message);
    if (parsedMessage) {
      console.log('Parsed message:', JSON.stringify(parsedMessage, null, 2));
      
      // Validate password
      if (parsedMessage.password === '000000') {
        console.log('Password validated successfully');
        sendHeartbeatResponse(clientSocket, parsedMessage.deviceId);
        
        // Forward to LED controller if connected
        if (ledControllerSocket && ledControllerSocket.writable) {
          const formattedMessage = `${parsedMessage.deviceId}:${parsedMessage.fullMessage}\n`;
          ledControllerSocket.write(formattedMessage);
          console.log('Forwarded to LED controller:', formattedMessage.trim());
        } else {
          console.log('LED controller socket not writable, buffering or handling locally');
          // Implement local handling or buffering here
        }
      } else {
        console.log('Invalid password');
        // Optionally, send an error response to the client
        clientSocket.write('ERROR: Invalid password\n');
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
