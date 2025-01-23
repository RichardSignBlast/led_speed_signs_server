const net = require('net');

// Server configuration
const CLIENT_PORT = 8080;
const CLIENT_HOST = '0.0.0.0';

function calculateChecksums(data) {
    const cleanedData = data.flatMap(item => {
        if (typeof item === 'string') {
            return item.split(/\s+/).filter(part => part.length > 0);
        }
        return item;
    });

    const numericData = cleanedData.map(byte => parseInt(byte, 16) & 0xFF);
    const sum = numericData.reduce((sum, byte) => (sum + byte) & 0xFFFF, 0);
    const low = sum & 0xFF;
    const high = (sum >> 8) & 0xFF;
  
    return `${low.toString(16).padStart(2, '0').toUpperCase()} ${high.toString(16).padStart(2, '0').toUpperCase()}`;
}

function parseDeviceMessage(message) {
  const hexString = message.toString('hex');
  const match = hexString.match(/a5([\da-f]{22})(6832ffed0110)(474c474100)(303030303030)([\da-f]{22})([\da-f]{4})ae/);
  if (match) {
    return {
      deviceName: Buffer.from(match[1], 'hex').toString().replace(/\0+$/, ''),
      fixedPart: match[2],
      projectName: Buffer.from(match[3], 'hex').toString(),
      password: Buffer.from(match[4], 'hex').toString(),
      repeatedDeviceName: Buffer.from(match[5], 'hex').toString().replace(/\0+$/, ''),
      checksum: match[6],
      fullMessage: hexString
    };
  }
  return null;
}

function sendRegistrationResponse(socket, deviceName) {
  const deviceNameBuffer = Buffer.from(deviceName);
  const fixedPart = [0xe8, 0x32, 0xff, 0xed, 0x01, 0x10];
  const projectName = Buffer.from('GLGA\0');
  const password = Buffer.from('000000');
  
  const responseData = [
    0xa5,  // Start byte
    ...deviceNameBuffer, 0x00,  // Device name with null terminator
    ...fixedPart,
    ...projectName,
    ...password,
    ...deviceNameBuffer, 0x00,  // Repeat device name with null terminator
  ];

  // Calculate checksum for data from '32' to the end (excluding checksum and end byte)
  const checksumData = responseData.slice(responseData.indexOf(0x32));
  const checksum = calculateChecksums(checksumData.map(b => (typeof b === 'number' ? b : b.readUInt8(0)).toString(16).padStart(2, '0')));
  const [checksumLow, checksumHigh] = checksum.split(' ').map(b => parseInt(b, 16));

  responseData.push(checksumLow, checksumHigh, 0xae);  // Add checksum and end byte

  const response = Buffer.from(responseData);

  socket.write(response, (err) => {
    if (err) {
      console.error('Error sending registration response:', err);
    } else {
      console.log('Sent registration response to device:', response.toString('hex'));
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
      
      // Use the device name for registration
      console.log(`Device ${parsedMessage.deviceName} attempting registration from ${clientInfo}`);
      sendRegistrationResponse(clientSocket, parsedMessage.deviceName);
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
