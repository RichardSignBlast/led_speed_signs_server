const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const net = require('net');
const udp = require('dgram');

const app = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'build')));

// MySQL connection configuration
const pool = mysql.createPool({
    host: 'ledspeedsigns.mysql.database.azure.com',
    user: 'ledspeedsign_admin',
    password: 'Aloha#2024',
    database: 'led_speed_signs',
    port: 3306,
    // ssl: {
    //     ca: fs.readFileSync("DigiCertGlobalRootCA.crt.pem")
    // }
});

const client = new net.Socket();

// Henzkey server: 47.92.140.117, port: 9820
const henzkeyHost = '47.92.140.117';
const henzkeyPort = 9820;

// Function to connect and listen to Henzkey server
function connectToHenzkeyServer() {
    client.connect(henzkeyPort, henzkeyHost, () => {
      console.log('Initialized connection to Henzkey server');
    });
  
    client.on('data', (data) => {
      const hexData = data.toString('hex'); // Convert buffer to hexadecimal string
      console.log('RES:', hexData);
  
      // Convert hexadecimal string to decimal (or any other format as needed)
      const decimalData = parseInt(hexData, 16); // Parse hexadecimal string to decimal
  
      // Example: Processing the decimal data further or sending it somewhere else
      // processDecimalData(decimalData);
    });
  
    client.on('close', () => {
      console.log('Connection to Henzkey server closed');
      // Reconnect or handle reconnect logic if needed
    });
  
    client.on('error', (err) => {
      console.error('Error connecting to Henzkey server:', err);
      // Handle error, reconnect, or other logic as needed
    });
}
  
  // Start listening to Henzkey server when the server starts
  connectToHenzkeyServer();

function toHex(num) {
    return ('0' + num.toString(16)).slice(-2).toUpperCase();
}

app.post('/api/push_update', (req, res) => {
    // Example numbers to convert to hexadecimal and send
    const numbers = [
      0x7E, 0x7E, 0xA0, 0x11, 0x01, 0x00, 0x02, 0x14, 0xA2, 0x00,
      0x01, 0x01, 0x01, 0x01, 0x01, 0x21, 0x01, 0x02, 0x00, 0x00,
      0x00, 0x00, 0xEF, 0xEF
    ];
  
    // Convert numbers to hexadecimal string
    const hexMessage = numbers.map(toHex).join('');
  
    // Send the hexadecimal message over the TCP connection to Henzkey server
    client.write(hexMessage, (err) => {
      if (err) {
        console.error('Error writing to Henzkey server:', err);
        res.status(500).json({ error: 'Failed to send data to Henzkey server' });
      } else {
        console.log(hexMessage);
        res.status(200).json({ message: 'Update Received and Sent.' });
      }
    });
});






// Handle device info update
app.post('/api/update_device', (req, res) => {
    const { username, devices } = req.body;

    if (!username || !devices || !Array.isArray(devices)) {
        return res.status(400).json({ error: 'Invalid request' });
    }

    // Use pool.getConnection() to get a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Begin transaction to update devices
        connection.beginTransaction((err) => {
            if (err) {
                console.error('Error beginning transaction: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Prepare SQL statements to update each device
            const updatePromises = devices.map(device => {
                return new Promise((resolve, reject) => {
                    connection.query('UPDATE devices SET label = ?, note = ?, lat = ?, lon = ? WHERE id = ?',
                        [device.label, device.note, device.lat, device.lon, device.id],
                        (err, result) => {
                            if (err) {
                                return reject(err);
                            }
                            resolve(result);
                        }
                    );
                });
            });

            // Execute all update queries
            Promise.all(updatePromises)
                .then(() => {
                    connection.commit((err) => {
                        if (err) {
                            console.error('Error committing transaction: ', err);
                            return connection.rollback(() => {
                                res.status(500).json({ error: 'Database error' });
                            });
                        }
                        res.status(200).json({ message: 'Devices updated successfully' });
                    });
                })
                .catch((err) => {
                    console.error('Error updating devices: ', err);
                    connection.rollback(() => {
                        res.status(500).json({ error: 'Database error' });
                    });
                })
                .finally(() => {
                    connection.release(); // Release the connection back to the pool
                });
        });
    });
});

// Handle save preset request
app.post('/api/save', (req, res) => {
    // console.log(req.body);
    const {
        currentPreset, minSpeed, thresholdSpeed, maxSpeed, 
        belowThresholdProgramNumber,belowThresholdProgramImage, belowThresholdProgramBoth,
        belowThresholdColorRed, belowThresholdColorGreen,
        belowThresholdTimers1, belowThresholdTimers2, belowThresholdImage,
        aboveThresholdProgramNumber,aboveThresholdProgramImage, aboveThresholdProgramBoth,
        aboveThresholdColorRed, aboveThresholdColorGreen,
        aboveThresholdTimers1, aboveThresholdTimers2, aboveThresholdImage,
        radarDirection, radarDigit, radarSensitivity, radarHold,
        monthSchedule, weekSchedule,
        jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec,
        mon, tue, wed, thu, fri, sat, sun, timeStart, timeEnd
      } = req.body;

    // Format parameters for sql update
    let belowThresholdProgram = -1;
    if (belowThresholdProgramNumber) {
        belowThresholdProgram = 0;
    } else if (belowThresholdProgramImage) {
        belowThresholdProgram = 1;
    } else if (belowThresholdProgramBoth) {
        belowThresholdProgram = 2;
    }

    let belowThresholdColor = -1;
    if (belowThresholdColorRed) {
        belowThresholdColor = 0;
    } else if (belowThresholdColorGreen) {
        belowThresholdColor = 1;
    }

    let aboveThresholdProgram = -1;
    if (aboveThresholdProgramNumber) {
        aboveThresholdProgram = 0;
    } else if (aboveThresholdProgramImage) {
        aboveThresholdProgram = 1;
    } else if (aboveThresholdProgramBoth) {
        aboveThresholdProgram = 2;
    }

    let aboveThresholdColor = -1;
    if (aboveThresholdColorRed) {
        aboveThresholdColor = 0;
    } else if (aboveThresholdColorGreen) {
        aboveThresholdColor = 1;
    }

    // Use pool.getConnection() to get a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Perform the query to check username and password
        connection.query("UPDATE presets SET minSpeed = ?, thresholdSpeed = ?, maxSpeed = ?, belowProgram = ?, belowColor = ?, belowTimer1 = ?, belowTimer2 = ?, belowContent = ?, overProgram = ?, overColor = ?, overTimer1 = ?, overTimer2 = ?, overContent = ?, radarDirection = ?, radardigit = ?, sensitivity = ?, hold = ?, timePeriodMonth = ?, timePeriodWeek = ?, monthJan = ?, monthFeb = ?, monthMar = ?, monthApr = ?, monthMay = ?, monthJun = ?, monthJul = ?, monthAug = ?, monthSep = ?, monthOct = ?, monthNov = ?, monthDec = ?, weekMon = ?, weekTue = ?, weekWed = ?, weekThu = ?, weekFri = ?, weekSat = ?, weekSun = ?, timeStart = ?, timeEnd = ? WHERE presetid = ?",
            [minSpeed, thresholdSpeed, maxSpeed, belowThresholdProgram, belowThresholdColor, belowThresholdTimers1, belowThresholdTimers2, belowThresholdImage, aboveThresholdProgram, aboveThresholdColor, aboveThresholdTimers1, aboveThresholdTimers2, aboveThresholdImage, radarDirection, radarDigit, radarSensitivity, radarHold, weekSchedule, monthSchedule, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, mon, tue, wed, thu, fri, sat, sun, timeStart, timeEnd, currentPreset],
            (err, results) => {
            connection.release(); // Release the connection back to the pool
            if (err) {
                console.log('if error')
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            } else {
                res.status(200).json({
                    message: 'Save successful'
                });
            }
        });
    });
});

// Endpoint to fetch devices based on username
app.get('/api/presets', (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Parameters is required' });
    }

    // Use pool.getConnection() to get a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Perform the query to fetch devices based on username
        connection.query('SELECT * FROM presets WHERE username = ?', [username], (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Return devices data as JSON response
            res.status(200).json({ devices: results });
        });
    });
}); 

// Endpoint to fetch devices based on username
app.get('/api/devices', (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Parameters is required' });
    }

    // Use pool.getConnection() to get a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Perform the query to fetch devices based on username
        connection.query('SELECT * FROM devices WHERE username = ?', [username], (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Return devices data as JSON response
            res.status(200).json({ devices: results });
        });
    });
});

// Handle login request
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Use pool.getConnection() to get a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Perform the query to check username and password
        connection.query('SELECT * FROM users WHERE username = ? AND pwd = ?', [username, password], (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (results.length > 0) {
                // User found, return success response with user data
                const user = results[0];
                res.status(200).json({
                    message: 'Login successful',
                    username: user.username,
                    company: user.company
                });
            } else {
                // No user found with given credentials
                res.status(401).json({ error: 'Invalid credentials' });
            }
        });
    });
});

// Serve React static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
