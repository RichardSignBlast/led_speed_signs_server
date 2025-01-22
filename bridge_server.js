const net = require('net');

const CLIENT_PORT = 8080; // Port for clients to connect to this server
const CLIENT_HOST = '0.0.0.0'; // Listen on all available network interfaces

const LED_CONTROLLER_IP = '192.168.1.223'; // Replace with your LED controller's IP
const LED_CONTROLLER_PORT = 5200; // Replace with your LED controller's port

// Create the server for clients to connect to
const server = net.createServer((clientSocket) => {
  console.log('Client connected:', clientSocket.remoteAddress);

  // Connect to the LED controller
  const ledControllerSocket = new net.Socket();
  ledControllerSocket.connect(LED_CONTROLLER_PORT, LED_CONTROLLER_IP, () => {
    console.log('Connected to LED controller');
  });

  // Forward data from client to LED controller
  clientSocket.on('data', (data) => {
    console.log('Received from client:', data.toString().trim());
    ledControllerSocket.write(data);
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

  // Handle errors
  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err);
  });

  ledControllerSocket.on('error', (err) => {
    console.error('LED controller socket error:', err);
    clientSocket.write('Error communicating with LED controller\r\n');
  });
});

server.listen(CLIENT_PORT, CLIENT_HOST, () => {
  console.log(`Server listening on ${CLIENT_HOST}:${CLIENT_PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
