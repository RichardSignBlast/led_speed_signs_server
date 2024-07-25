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
      console.log('Connected to Henzkey server');
    });
  
    client.on('data', (data) => {
      // Convert received Buffer to hexadecimal string
      const hexData = data.toString('hex');
      console.log('res: ', data);
  
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



function ascii_to_hexa(str)
{
    var arr1 = [];
    for (var n = 0, l = str.length; n < l; n++)
    {
        var hex = Number(str.charCodeAt(n)).toString(16);
        arr1.push(hex);
    }
    return arr1.join('');
}


function toHex(originalText) {
    // Remove spaces and return concatenated hexadecimal string
    return originalText.replace(/\s/g, '');
}

function getDigits(str) {
    let c = "0123456789";
    function check(x) {
        return c.includes(x) ? true : false;
    }

    let matches = [...str].reduce(
        (x, y) => (check(y) ? x + y : x),"");

    if (matches) {
        return Number(matches);
    }
}




app.post('/api/push_update', (req, res) => {
    // ADD DEVICE ID - checkedItems
    const {
        checkedItems, currentPreset, minSpeed, thresholdSpeed, maxSpeed, 
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
    
    // Loop all checkedItems to push update
    Object.keys(checkedItems).forEach((item) => {
        console.log('--- Pushing update for device:', item, '---');


        // ========================== Convert parameters to HEX ==========================

        const deviceID = getDigits(item);
        const deviceID_hex = deviceID.toString(16).padStart(2, '0');
        const minSpeed_hex = minSpeed.toString(16).padStart(2, '0');
        const thresholdSpeed_hex = thresholdSpeed.toString(16).padStart(2, '0');

        /*
        |---------------------------------------------------------------------------------------------|
        |Below\Above  | Number(green) | Number(red)   | Image         | Both(green)   | Both(red)     | 
        |---------------------------------------------------------------------------------------------|
        |Number(green)|      19       |      99       |      A9       |      39       |      B9       |
        |---------------------------------------------------------------------------------------------|
        |Number(red)  |      11       |      91       |      A1       |      31       |      B1       |
        |---------------------------------------------------------------------------------------------|
        |Image        |      12       |      92       |      A2       |      32       |      B2       |
        |---------------------------------------------------------------------------------------------|
        |Both(green)  |      1B       |      9B       |      AB       |      3B       |      BB       |
        |---------------------------------------------------------------------------------------------|
        |Both(red)    |      13       |      93       |      A3       |      33       |      B3       |
        |---------------------------------------------------------------------------------------------|
        */
       let program_hex = '00';
        if (belowThresholdProgramNumber) {                  //    Below     ,    Above
            if (belowThresholdColorGreen) {
                if (aboveThresholdProgramNumber) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '19';                     // Number(green), Number(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = '99';                     // Number(green), Number(red)
                    }
                } else if (aboveThresholdProgramImage) {
                    program_hex = 'a9';                         // Number(green), Image
                } else if (aboveThresholdProgramBoth) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '39';                     // Number(green), Both(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = 'b9';                     // Number(green), Both(red)
                    }
                }
            } else if (belowThresholdColorRed) {
                if (aboveThresholdProgramNumber) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '11';                     // Number(red), Number(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = '91';                     // Number(red), Number(red)
                    }
                } else if (aboveThresholdProgramImage) {
                    program_hex = 'a1';                         // Number(red), Image
                } else if (aboveThresholdProgramBoth) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '31';                     // Number(red), Both(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = 'b1';                     // Number(red), Both(red)
                    }
                }
            }
        } else if (belowThresholdProgramImage) {
            if (aboveThresholdProgramNumber) {
                if (aboveThresholdColorGreen) {
                    program_hex = '12';                         // Image, Number(green)
                } else if (aboveThresholdColorRed) {
                    program_hex = '92';                         // Image, Number(red)
                }
            } else if (aboveThresholdProgramImage) {
                program_hex = 'a2';                             // Image, Image
            } else if (aboveThresholdProgramBoth) {
                if (aboveThresholdColorGreen) {
                    program_hex = '32';                         // Image, Both(green)
                } else if (aboveThresholdColorRed) {
                    program_hex = 'b2';                         // Image, Both(red)
                }
            }
        } else if (belowThresholdProgramBoth) {
            if (belowThresholdColorGreen) {
                if (aboveThresholdProgramNumber) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '1b';                     // Both(green), Number(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = '9b';                     // Both(green), Number(red)
                    }
                } else if (aboveThresholdProgramImage) {
                    program_hex = 'ab';                         // Both(green), Image
                } else if (aboveThresholdProgramBoth) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '3b';                     // Both(green), Both(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = 'bb';                     // Both(green), Both(red)
                    }
                }
            } else if (belowThresholdColorRed) {
                if (aboveThresholdProgramNumber) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '13';                     // Both(red), Number(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = '93';                     // Both(red), Number(red)
                    }
                } else if (aboveThresholdProgramImage) {
                    program_hex = 'a3';                         // Both(red), Image
                } else if (aboveThresholdProgramBoth) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '33';                     // Both(red), Both(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = 'b3';                     // Both(red), Both(red)
                    }
                }
            }
        }

        const belowThresholdImage_hex = (belowThresholdImage-1).toString(16).padStart(2, '0');
        const belowThresholdTimers1_hex = belowThresholdTimers1.toString(16).padStart(2, '0');
        const belowThresholdTimers2_hex = belowThresholdTimers2.toString(16).padStart(2, '0');
        const aboveThresholdImage_hex = (aboveThresholdImage-1).toString(16).padStart(2, '0');
        const aboveThresholdTimers1_hex = aboveThresholdTimers1.toString(16).padStart(2, '0');
        const aboveThresholdTimers2_hex = aboveThresholdTimers2.toString(16).padStart(2, '0');

        /*
        |---------------------------------------|
        | Direction\Digit | 2-Digits | 3-Digits |
        |---------------------------------------|
        |     Near        |    01    |    21    |
        |---------------------------------------|
        |     Away        |    02    |    22    |
        |---------------------------------------|
        |     2-Ways      |    03    |    23    |
        |---------------------------------------|
        */
        let radar_hex = '01';

        if (radarDirection == 0) {
            if (radarDigit == 2) {
                radar_hex = '01';                  // Near, 2
            } else if (radarDigit == 3) {
                radar_hex = '21';                  // Near, 3
            }
        } else if (radarDirection == 1) {
            if (radarDigit == 2) {
                radar_hex = '02';                  // Away, 2
            } else if (radarDigit == 3) {
                radar_hex = '22';                  // Away, 3
            }
        } else if (radarDirection == 2) {
            if (radarDigit == 2) {
                radar_hex = '03';                  // 2-Ways, 2
            } else if (radarDigit == 3) {
                radar_hex = '23';                  // 2-Ways, 3
            }
        }

        // 1 <= sensitivity <= 15
        let sensitivity = radarSensitivity;
        if (sensitivity < 1) {
            sensitivity = 1;
        } else if (sensitivity > 15) {
            sensitivity = 15;
        }
        const radarSensitivity_hex = sensitivity.toString(16).padStart(2, '0');
        const radarHold_hex = radarHold.toString(16).padStart(2, '0');
        

        // ========================== Convert HEX Text to HEX Buffer ======================

        const originalText = 
        '7E 7E A0 '
        + deviceID_hex
        + ' 01 00 '
        + minSpeed_hex
        + thresholdSpeed_hex
        + program_hex
        + belowThresholdImage_hex 
        + belowThresholdTimers1_hex
        + belowThresholdTimers2_hex
        + aboveThresholdImage_hex
        + aboveThresholdTimers1_hex
        + aboveThresholdTimers2_hex
        + radar_hex
        + radarSensitivity_hex
        + radarHold_hex
        + ' 00 00 00 00 EF EF';
        
        const hexMessage =toHex(originalText);
        const hexBuffer = Buffer.from(hexMessage, 'hex');


        // ========================== Send HEX Buffer to Henzkey =========================
        
        client.write(hexBuffer, (err) => {
            if (err) {
            console.error('Error writing to Henzkey server:', err);
            res.status(500).json({ error: 'Failed to send data to Henzkey server' });
            } else {
            console.log('Data sent successfully to Henzkey server');
            res.status(200).json({ message: 'Update Received and Sent.' });
            }
        });
        
        console.log('req:',hexBuffer);
    });
    //res.status(200).json({ message: 'Update Received and Sent.' });
});

// listen to Henzkey server
connectToHenzkeyServer();



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
        checkedItems, currentPreset, minSpeed, thresholdSpeed, maxSpeed, 
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
