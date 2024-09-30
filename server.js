const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const net = require('net');
const udp = require('dgram');
//const rp = require('request-promise');

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

// listen to Henzkey server
connectToHenzkeyServer();
log();

// Function to connect and listen to Henzkey server
function connectToHenzkeyServer() {
    client.connect(henzkeyPort, henzkeyHost, () => {
      console.log('Connected to external servers');
    });
  
    client.on('data', (data) => {
        // Convert received Buffer to hexadecimal string
        const hexData = data.toString('hex');
        // Auto response length = 16
        // Set response length = 48
        if (hexData.length < 48) {
            console.log('msg:', data);
        } else {
            console.log('res:', data);
        }
  
    });
  
    client.on('close', () => {
        console.log('Connection to external servers closed');
        // Reconnect or handle reconnect logic if needed
    });
  
    client.on('error', (err) => {
        console.error('Error connecting to external servers server:', err);
        // Handle error, reconnect, or other logic as needed
    });
}
  
  // Start listening to Henzkey server when the server starts


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


function extractData(hexMessage) {
    // Convert hexMessage from hex string to Buffer
    const startMarker = '7e7e';
    const endMarker = 'efef';
    const buffer = Buffer.from(hexMessage, 'hex');

    const startBuffer = Buffer.from(startMarker, 'hex');
    const endBuffer = Buffer.from(endMarker, 'hex');
    const startIdx = buffer.indexOf(startBuffer);
    const endIdx = buffer.indexOf(endBuffer, startIdx + startBuffer.length);

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx + startBuffer.length) {
        throw new Error('Markers not found or in incorrect order');
    }

    // Extract data between markers
    const dataBuffer = buffer.slice(startIdx + startBuffer.length, endIdx);
    
    // Convert extracted data buffer back to hex string
    const dataHexString = dataBuffer.toString('hex');

    return dataHexString;
}


function onlineLoop(labels, size, time) {
    setTimeout(function() {
        if (size >= 0) {

            const label = labels[size];

            const labelNum = getDigits(label);
            const label_hex = labelNum.toString(16).padStart(2, '0');

            // ========================== Convert HEX Text to HEX Buffer ======================

            const originalText = 
            '7E 7E A0 '
            + label_hex
            + ' 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 EF EF';
            
            const hexMessage =toHex(originalText);
            const hexBuffer = Buffer.from(hexMessage, 'hex');


            // ========================== Send HEX Buffer to Henzkey =========================


            client.write(hexBuffer, (err) => {
                if (err) {
                console.error('Error writing to external servers:', err);
                res.status(500).json({ error: 'Failed to send data to external servers' });
                }
            });

            console.log('req:',hexBuffer);

            onlineLoop(labels, size-1, time);
        }
    }, time);     // Delay 200ms between each requests
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// Function to insert log entry into the database
function insertLogEntry(onlineDevices, totalDevices) {
    const now = new Date();
    const onlineDevicesStr = onlineDevices.join(','); // Convert array to CSV string

    const query = `
        INSERT INTO logs (created_at, online_devices, total_devices)
        VALUES (?, ?, ?)
    `;

    const values = [now, onlineDevicesStr, totalDevices];

    pool.query(query, values, (error, results) => {
        if (error) {
            console.error('Error inserting log entry:', error);
        } else {
            console.log('Data inserted into logs with ID:', results.insertId);
        }
    });
}


// =============================================================
function log() {
    // Function to calculate the time until the next hour
    function timeUntilNextHour() {
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
        return nextHour - now;
    }

    // Function to calculate the time until 1:30 AM Brisbane time
    function timeUntilNextRestart() {
        const now = new Date();
        const currentTimeInBrisbane = new Date(now.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' }));

        const nextRestart = new Date(
            currentTimeInBrisbane.getFullYear(),
            currentTimeInBrisbane.getMonth(),
            currentTimeInBrisbane.getDate(),
            1, 30, 0, 0 // Set to 1:30 AM Brisbane time
        );

        if (currentTimeInBrisbane >= nextRestart) {
            // If it's already past 1:30 AM, schedule for the next day
            nextRestart.setDate(nextRestart.getDate() + 1);
        }

        return nextRestart - currentTimeInBrisbane;
    }

    // Helper function to get Brisbane time for logging
    function getBrisbaneTime() {
        return new Intl.DateTimeFormat('en-AU', {
            timeZone: 'Australia/Brisbane',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(new Date());
    }

    // Function to start logging at the exact hour
    function startLogging() {
        const logInterval = 60 * 60 * 1000; // 1 hour

        async function logOnlineDevices() {
            const brisbaneTime = getBrisbaneTime();
            console.log(`--- Starting Online Devices Logging at ${brisbaneTime} ---`);

            // --- Get online devices ---
            const devices = Array.from({ length: 32 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`).join(',');
            const deviceCount = devices.split(',').length;

            if (!devices) {
                return console.error('Invalid data format. Expected an array of devices.');
            }

            const labels = devices.split(',');
            let onlineDevices = [];

            // Add data listener
            const dataListener = (data) => {
                const hexData = data.toString('hex');
                if (hexData.length >= 48) {
                    onlineDevices.push(hexData);
                }
            };
            client.on('data', dataListener);

            // Loop 3 times to get accurate but slow online devices result
            onlineLoop(labels, labels.length - 1, 300);
            await sleep(15000);
            onlineLoop(labels, labels.length - 1, 300);
            await sleep(15000);
            onlineLoop(labels, labels.length - 1, 300);
            await sleep(15000);

            client.removeListener('data', dataListener);

            let onlineResult = new Set();

            onlineDevices.forEach((deviceHex) => {
                const extracted = extractData(deviceHex).slice(2, 4);
                labels.forEach((label) => {
                    if (getDigits(label) === parseInt(extracted, 16)) {
                        onlineResult.add(label);
                    }
                });
            });

            onlineResult = Array.from(onlineResult);
            onlineResult.sort();

            console.log("Online Result - Log:");
            console.log(onlineResult);

            labels.forEach((label) => {
                if (onlineResult.includes(label)) {
                    updateDeviceOnline(label, true);
                } else {
                    updateDeviceOnline(label, false);
                }
            });

            // Insert log entry into the database
            insertLogEntry(onlineResult, deviceCount);  // Using `deviceCount` here
        }

        // Calculate time until next hour and schedule the logging
        const initialTimeout = timeUntilNextHour();
        console.log(`Next logging device online in ${initialTimeout / 60000} minutes...`);
        setTimeout(() => {
            // Start logging at the next hour
            logOnlineDevices();
            // Set interval to log every hour
            setInterval(logOnlineDevices, logInterval);
        }, initialTimeout);
    }

    // Function to schedule handleRestart at 1:30 AM Brisbane time every day
    function scheduleDailyRestart() {
        const timeUntilRestart = timeUntilNextRestart();
        console.log(`Next scheduled soft restart in ${timeUntilRestart / 60000} minutes...`);

        const devices = Array.from({ length: 32 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`).join(',');
        const labels = devices.split(',');

        // Schedule the first call
        setTimeout(() => {
            console.log("=== Scheduled Restart ===");
            handleRestart(labels, labels.length - 1, 300);

            // Insert restart log to DB
            // (No device online, total_device = 0)
            let onlineResult = new Array();
            console.log("Logging Scheduled Restart...")
            insertLogEntry(onlineResult, 0);

            // Schedule it to run again every 24 hours after the first call
            setInterval(() => {
                handleRestart(labels, labels.length - 1, 300);

                // Insert restart log to DB
                // (No device online, total_device = 0)
                let onlineResult = new Array();
                console.log("Logging Scheduled Restart...")
                insertLogEntry(onlineResult, 0);
            }, 24 * 60 * 60 * 1000); // Every 24 hours

        }, timeUntilRestart);
    }

    // Start logging at the exact hour and then every hour
    startLogging();

    // Schedule daily restart
    scheduleDailyRestart();
}


function handleRestart(labels, size, time) {
    setTimeout(function() {
        if (size >= 0) {

            const label = labels[size];

            const labelNum = "" + getDigits(label);
            const label_hex = labelNum.toString(16).padStart(2, '0');

            // ========================== Convert HEX Text to HEX Buffer ======================

            const originalText = 
            '7E 7E A0 '
            + label_hex
            + ' 5E 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 EF EF';
            
            const hexMessage =toHex(originalText);
            const hexBuffer = Buffer.from(hexMessage, 'hex');


            // ========================== Send HEX Buffer to Henzkey =========================

            client.write(hexBuffer, (err) => {
                if (err) {
                console.error('Error writing to external servers:', err);
                res.status(500).json({ error: 'Failed to send data to external servers' });
                }
            });

            console.log('req:',hexBuffer);

            handleRestart(labels, size-1, time);
        }
    }, time);     // Delay 200ms between each requests
}

// =============================================================
/* Operating log function without restart
function log() {
    // Function to calculate the time until the next hour
    function timeUntilNextHour() {
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
        return nextHour - now;
    }

    // Function to get the current time in Brisbane time
    function getBrisbaneTime() {
        return new Intl.DateTimeFormat('en-AU', {
            timeZone: 'Australia/Brisbane',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(new Date());
    }

    // Function to start logging at the exact hour
    function startLogging() {
        setInterval(async () => {
            const brisbaneTime = getBrisbaneTime();
            console.log(`--- Starting Online Devices Logging at ${brisbaneTime} ---`);

            // --- Get online devices ---
            const devices = Array.from({ length: 32 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`).join(',');
            const deviceCount = devices.split(',').length;

            if (!devices) {
                return console.error('Invalid data format. Expected an array of devices.');
            }

            const labels = devices.split(',');
            let onlineDevices = [];

            // Add data listener
            const dataListener = (data) => {
                const hexData = data.toString('hex');
                if (hexData.length >= 48) {
                    onlineDevices.push(hexData);
                }
            };
            client.on('data', dataListener);

            // Loop 3 times to get accurate but slow online devices result
            onlineLoop(labels, labels.length - 1, 300);
            await sleep(15000);
            onlineLoop(labels, labels.length - 1, 300);
            await sleep(15000);
            onlineLoop(labels, labels.length - 1, 300);
            await sleep(15000);

            client.removeListener('data', dataListener);

            let onlineResult = new Set();

            onlineDevices.forEach((deviceHex) => {
                const extracted = extractData(deviceHex).slice(2, 4);
                labels.forEach((label) => {
                    if (getDigits(label) === parseInt(extracted, 16)) {
                        onlineResult.add(label);
                    }
                });
            });

            onlineResult = Array.from(onlineResult);
            onlineResult.sort();

            console.log("Online Result - Log:");
            console.log(onlineResult);

            labels.forEach((label) => {
                if (onlineResult.includes(label)) {
                    updateDeviceOnline(label, true);
                } else {
                    updateDeviceOnline(label, false);
                }
            });
             
            // Insert log entry into the database
            insertLogEntry(onlineResult, deviceCount);  // Using `deviceCount` here

        }, 60 * 60000); // Log every hour (60 minutes)
    }

    // Wait until the next hour to start the logging
    const initialTimeout = timeUntilNextHour();
    console.log(`Waiting ${initialTimeout / 60000} minutes until the next hour to start logging...`);
    
    setTimeout(() => {
        startLogging();
    }, initialTimeout);
}
*/


function updateDeviceOnline(device, online) {
    const query = 'UPDATE devices SET connected = ? WHERE label = ?';

    const values = [online, device];

    pool.query(query, values, (error, results) => {
        if (error) {
            console.error('Error Updateing Device Connection Status:', error);
        } else {
            console.log('Device Connection Status Success:', device, '=>', online, ', affectedRows: ', results.affectedRows);
        }
    });
}

app.get('/admin/logs_last_12months', async (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Calculate the timestamp for 12 months ago
        const now = new Date();
        const twelveMonthsAgo = new Date(now.setMonth(now.getMonth() - 12));
        const formattedTwelveMonthsAgo = twelveMonthsAgo.toISOString().slice(0, 19).replace('T', ' ');

        // Perform the query to fetch logs from the last 12 months
        const query = `SELECT * FROM logs WHERE created_at >= ? ORDER BY created_at DESC`;
        connection.query(query, [formattedTwelveMonthsAgo], (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Return logs data as JSON response
            res.status(200).json({ logs: results });
        });
    });
});


app.get('/admin/logs_last_30days', async (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Calculate the timestamp for 30 days ago
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const formattedThirtyDaysAgo = thirtyDaysAgo.toISOString().slice(0, 19).replace('T', ' ');

        // Perform the query to fetch logs from the last 30 days
        const query = `SELECT * FROM logs WHERE created_at >= ? ORDER BY created_at DESC`;
        connection.query(query, [formattedThirtyDaysAgo], (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Return logs data as JSON response
            res.status(200).json({ logs: results });
        });
    });
});

app.get('/admin/logs_last_7days', async (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Calculate the timestamp for 7 days ago
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const formattedSevenDaysAgo = sevenDaysAgo.toISOString().slice(0, 19).replace('T', ' ');

        // Perform the query to fetch logs from the last 7 days
        const query = `SELECT * FROM logs WHERE created_at >= ? ORDER BY created_at DESC`;
        connection.query(query, [formattedSevenDaysAgo], (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Return logs data as JSON response
            res.status(200).json({ logs: results });
        });
    });
});


app.get('/admin/logs_last_24hr', async (req, res) => {
    // Use pool.getConnection() to get a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Calculate the timestamp for 24 hours ago
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const formattedTwentyFourHoursAgo = twentyFourHoursAgo.toISOString().slice(0, 19).replace('T', ' ');

        // Perform the query to fetch logs from the last 24 hours
        const query = `SELECT * FROM logs WHERE created_at >= ? ORDER BY created_at DESC`;
        connection.query(query, [formattedTwentyFourHoursAgo], (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            // Return logs data as JSON response
            res.status(200).json({ logs: results });
        });
    });
});


app.get('/admin/logs_all', async (req, res) => {

    // Use pool.getConnection() to get a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Perform the query to fetch all logs
        connection.query('SELECT * FROM logs', (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Return devices data as JSON response
            res.status(200).json({ devices: results });
        });
    });
})

app.get('/admin/latest_status', async (req, res) => {

    // Use pool.getConnection() to get a connection from the pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection: ', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Perform the query to fetch all devices
        connection.query('SELECT * FROM devices', (err, results) => {
            connection.release(); // Release the connection back to the pool

            if (err) {
                console.error('Error querying database: ', err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Return devices data as JSON response
            res.status(200).json({ devices: results });
        });
    });
})

app.get('/api/online', async (req, res) => {
    const { devices } = req.query;
    let onlineDevices = [];

    if (!devices) {
        return res.status(400).json({ error: 'Invalid data format. Expected an array of devices.' });
    }

    const labels = devices.split(',');

    // Initiate the loop to send requests
    onlineLoop(labels, labels.length - 1, 250);

    // Listen for data from the Henzkey server
    client.on('data', (data) => {
        const hexData = data.toString('hex');
        if (hexData.length >= 48) {
            onlineDevices.push(hexData);
        }
    });

    // Wait for the responses
    await sleep(10000);

    let onlineResult = new Set();

    onlineDevices.forEach((deviceHex) => {
        const extracted = extractData(deviceHex).slice(2, 4);
        labels.forEach((label) => {
            if (getDigits(label) === parseInt(extracted, 16)) {
                onlineResult.add(label);
            }
        });
    });

    // Convert the Set back to an array and sort it
    onlineResult = Array.from(onlineResult);
    onlineResult.sort();

    console.log("Online Result - Search:");
    console.log(onlineResult);


    res.status(200).json({ devices: onlineResult });
});

// Endpoint to fetch devices based on username
app.get('/api/settings', async (req, res) => {
    const { device } = req.query;

    if (!device) {
        return res.status(400).json({ error: 'Parameters is required' });
    }



    onlineLoop([device], 0, 0);
    
    client.on('data', (data) => {
        // Convert received Buffer to hexadecimal string
        const hexData = data.toString('hex');
        // Auto response length = 16
        // Set response length = 48
        if (hexData.length >= 48) {
            onlineDevices.push(hexData);
        }
  
    });

    var onlineDevices = [];

    await sleep(2000);

    // Wait 5000ms for the online status to response
    //sleep(5000).then(() => {
    //console.log('Online Devices:');

    let i = 0;

    while ( i < onlineDevices.length) {
        const extracted = extractData(onlineDevices[i]).slice(2, 4);;
        //console.log(parseInt(extracted, 16));
        //console.log(extracted);

        if (parseInt(extracted, 16) === getDigits(device)) {
            const dataBytes = extractData(onlineDevices[i])
            
            // Divide data bytes
            const result = [];
            for (let i = 0; i < dataBytes.length; i += 2) {
                result.push(dataBytes.slice(i, i + 2));
            }
            
            /*
            Defination of Device Settings Result

            index | Defination
            0       link_addr
            1       device_id
            2       cmd
            3       placeholder, always 00
            4       on speed
            5       over speed
            6       program
            7       below image
            8       below timer1
            9       below timer2
            10      above image
            11      above timer1
            12      above timer2
            13      direction/unit/digit
            14      sensitivity
            15      hold
            16-19   null
            */
            if (result.length >= 20) {
                let belowProgramNumber = false, belowProgramImage = false, belowProgramBoth = false;
                let belowRed = false, belowGreen = false;
                let aboveProgramNumber = false, aboveProgramImage = false, aboveProgramBoth = false;
                let aboveRed = false, aboveGreen = false;
                let flicker = false;

                switch (result[6]) {        // Below         |  Above           
                    case "19":              // Number(green)    Number(green)   === Flicker Off ===   
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        break;
                    case "99":              // Number(green)    Number(red)
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        break;
                    case "a9":              // Number(green)    Image
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        break;
                    case "39":              // Number(green)    Both(green)
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        break;
                    case "b9":              // Number(green)    Both(red)
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        break;
                    case "11":              // Number(red)      Number(green)
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        break;
                    case "91":              // Number(red)      Number(red)
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        break;
                    case "a1":              // Number(red)      Image
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        break;
                    case "31":              // Number(red)      Both(green)
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        break;
                    case "b1":              // Number(red)      Both(red)
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        break;
                    case "12":              // Image            Number(green)
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        break;
                    case "92":              // Image            Number(red)
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        break;
                    case "a2":              // Image            Image
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        break;
                    case "32":              // Image            Both(green)
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        break;
                    case "b2":              // Image            Both(red)
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        break;
                    case "1b":              // Both(green)      Number(green)
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        break;
                    case "9b":              // Both(green)      Number(red)
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        break;
                    case "ab":              // Both(green)      Image
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        break;
                    case "3b":              // Both(green)      Both(green)
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        break;
                    case "bb":              // Both(green)      Both(red)
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        break;
                    case "13":              // Both(red)        Number(green)
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        break;
                    case "93":              // Both(red)        Number(red)
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        break;
                    case "a3":              // Both(red)        Image
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        break;
                    case "33":              // Both(red)        Both(green)
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        break;
                    case "b3":              // Both(red)        Both(red)
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        break;
                    case "5d":              // Number(green)    Number(green)   === Flicker On ===   
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "dd":              // Number(green)    Number(red)
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "ed":              // Number(green)    Image
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "7d":              // Number(green)    Both(green)
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "f9":              // Number(green)    Both(red)
                        belowProgramNumber = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "55":              // Number(red)      Number(green)
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "d5":              // Number(red)      Number(red)
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "e5":              // Number(red)      Image
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "75":              // Number(red)      Both(green)
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "f5":              // Number(red)      Both(red)
                        belowProgramNumber = true;
                        belowRed = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "56":              // Image            Number(green)
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "d6":              // Image            Number(red)
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "e6":              // Image            Image
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "76":              // Image            Both(green)
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "f6":              // Image            Both(red)
                        belowProgramImage = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "5f":              // Both(green)      Number(green)
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "db":              // Both(green)      Number(red)
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "eb":              // Both(green)      Image
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "7b":              // Both(green)      Both(green)
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "ff":              // Both(green)      Both(red)
                        belowProgramBoth = true;
                        belowGreen = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "57":              // Both(red)        Number(green)
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramNumber = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "d7":              // Both(red)        Number(red)
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramNumber = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "e7":              // Both(red)        Image
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramImage = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                    case "77":              // Both(red)        Both(green)
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramBoth = true;
                        aboveGreen = true;
                        flicker = true;
                        break;
                    case "f7":              // Both(red)        Both(red)
                        belowProgramBoth = true;
                        belowRed = true;
                        aboveProgramBoth = true;
                        aboveRed = true;
                        flicker = true;
                        break;
                }

                let direction = 0; // 0 - Towards, 1 - Away, 2 - 2-Ways
                let digit = 2;     // 2 - 2-Digits, 3 - 3-Digits
                
                switch (result[13]) {
                    case "01":      
                        direction = 0;
                        digit = 2;
                        break;
                    case "02":      
                        direction = 1;
                        digit = 2;
                        break;
                    case "03":      
                        direction = 2;
                        digit = 2;
                        break;
                    case "21":      
                        direction = 0;
                        digit = 3;
                        break;
                    case "22":      
                        direction = 1;
                        digit = 3;
                        break;
                    case "23":      
                        direction = 2;
                        digit = 3;
                        break;
                }

                res.status(200).json({ 
                    minSpeed: parseInt(result[4], 16), 
                    thresholdSpeed: parseInt(result[5], 16), 
                    maxSpeed: 200, 
                    belowThresholdProgramNumber: belowProgramNumber,
                    belowThresholdProgramImage: belowProgramImage, 
                    belowThresholdProgramBoth: belowProgramBoth,
                    belowThresholdColorRed: belowRed, 
                    belowThresholdColorGreen: belowGreen,
                    belowThresholdTimers1: parseInt(result[8], 16), 
                    belowThresholdTimers2: parseInt(result[9], 16), 
                    belowThresholdImage: (parseInt(result[7], 16) + 1),
                    aboveThresholdProgramNumber: aboveProgramNumber,
                    aboveThresholdProgramImage: aboveProgramImage, 
                    aboveThresholdProgramBoth: aboveProgramBoth,
                    aboveThresholdColorRed: aboveRed, 
                    aboveThresholdColorGreen: aboveGreen,
                    aboveThresholdTimers1: parseInt(result[11], 16), 
                    aboveThresholdTimers2: parseInt(result[12], 16), 
                    aboveThresholdImage: (parseInt(result[10], 16) + 1),
                    radarDirection: direction, 
                    radarDigit: digit, 
                    radarSensitivity: parseInt(result[14], 16), 
                    radarHold: parseInt(result[15], 16),
                    flicker: flicker
                });
            } else {
                res.status(500).send('Device Settings Incomplete.');
            }
        }
        i++;
    };
}); 









app.post('/api/push_update', (req, res) => {
    // ADD DEVICE ID - checkedItems
    const {
        flicker, checkedItems, currentPreset, minSpeed, thresholdSpeed, maxSpeed, 
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

    // =====================Save Preset=====================
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
        connection.query("UPDATE presets SET minSpeed = ?, thresholdSpeed = ?, maxSpeed = ?, belowProgram = ?, belowColor = ?, belowTimer1 = ?, belowTimer2 = ?, belowContent = ?, overProgram = ?, overColor = ?, overTimer1 = ?, overTimer2 = ?, overContent = ?, radarDirection = ?, radardigit = ?, sensitivity = ?, hold = ?, timePeriodMonth = ?, timePeriodWeek = ?, monthJan = ?, monthFeb = ?, monthMar = ?, monthApr = ?, monthMay = ?, monthJun = ?, monthJul = ?, monthAug = ?, monthSep = ?, monthOct = ?, monthNov = ?, monthDec = ?, weekMon = ?, weekTue = ?, weekWed = ?, weekThu = ?, weekFri = ?, weekSat = ?, weekSun = ?, timeStart = ?, timeEnd = ?, flicker = ? WHERE presetid = ?",
            [minSpeed, thresholdSpeed, maxSpeed, belowThresholdProgram, belowThresholdColor, belowThresholdTimers1, belowThresholdTimers2, belowThresholdImage, aboveThresholdProgram, aboveThresholdColor, aboveThresholdTimers1, aboveThresholdTimers2, aboveThresholdImage, radarDirection, radarDigit, radarSensitivity, radarHold, weekSchedule, monthSchedule, jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec, mon, tue, wed, thu, fri, sat, sun, timeStart, timeEnd, flicker, currentPreset],
            (err, results) => {
            connection.release(); // Release the connection back to the pool
        });
    });

    // =====================Push Update=====================
    
    // Loop all checkedItems to push update
    Object.keys(checkedItems).forEach((item) => {
        console.log('--- Pushing update for device:', item, '---');


        // ========================== Convert parameters to HEX ==========================

        const deviceID = getDigits(item);
        const deviceID_hex = deviceID.toString(16).padStart(2, '0');
        const minSpeed_hex = minSpeed.toString(16).padStart(2, '0');
        const thresholdSpeed_hex = thresholdSpeed.toString(16).padStart(2, '0');

        /*
                                            Flicker Off
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

                                            Flicker On
        |---------------------------------------------------------------------------------------------|
        |Below\Above  | Number(green) | Number(red)   | Image         | Both(green)   | Both(red)     | 
        |---------------------------------------------------------------------------------------------|
        |Number(green)|      5D       |      DD       |      ED       |      7D       |      F9       |
        |---------------------------------------------------------------------------------------------|
        |Number(red)  |      55       |      D5       |      E5       |      75       |      F5       |
        |---------------------------------------------------------------------------------------------|
        |Image        |      56       |      D6       |      E6       |      76       |      F6       |
        |---------------------------------------------------------------------------------------------|
        |Both(green)  |      5F       |      DB       |      EB       |      7B       |      FF       |
        |---------------------------------------------------------------------------------------------|
        |Both(red)    |      57       |      D7       |      E7       |      77       |      F7       |
        |---------------------------------------------------------------------------------------------|
        */
        let program_hex = '00';
        if (!flicker) {
            if (belowThresholdProgramNumber) {                      //    Below     ,    Above
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
        } else {                                                    // ======== Flicker On =========
            if (belowThresholdProgramNumber) {                      //    Below     ,    Above
                if (belowThresholdColorGreen) {
                    if (aboveThresholdProgramNumber) {
                        if (aboveThresholdColorGreen) {
                            program_hex = '5d';                     // Number(green), Number(green)
                        } else if (aboveThresholdColorRed) {
                            program_hex = 'dd';                     // Number(green), Number(red)
                        }
                    } else if (aboveThresholdProgramImage) {
                        program_hex = 'ed';                         // Number(green), Image
                    } else if (aboveThresholdProgramBoth) {
                        if (aboveThresholdColorGreen) {
                            program_hex = '7d';                     // Number(green), Both(green)
                        } else if (aboveThresholdColorRed) {
                            program_hex = 'f9';                     // Number(green), Both(red)
                        }
                    }
                } else if (belowThresholdColorRed) {
                    if (aboveThresholdProgramNumber) {
                        if (aboveThresholdColorGreen) {
                            program_hex = '55';                     // Number(red), Number(green)
                        } else if (aboveThresholdColorRed) {
                            program_hex = 'd5';                     // Number(red), Number(red)
                        }
                    } else if (aboveThresholdProgramImage) {
                        program_hex = 'e5';                         // Number(red), Image
                    } else if (aboveThresholdProgramBoth) {
                        if (aboveThresholdColorGreen) {
                            program_hex = '75';                     // Number(red), Both(green)
                        } else if (aboveThresholdColorRed) {
                            program_hex = 'f5';                     // Number(red), Both(red)
                        }
                    }
                }
            } else if (belowThresholdProgramImage) {
                if (aboveThresholdProgramNumber) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '56';                         // Image, Number(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = 'd6';                         // Image, Number(red)
                    }
                } else if (aboveThresholdProgramImage) {
                    program_hex = 'e6';                             // Image, Image
                } else if (aboveThresholdProgramBoth) {
                    if (aboveThresholdColorGreen) {
                        program_hex = '76';                         // Image, Both(green)
                    } else if (aboveThresholdColorRed) {
                        program_hex = 'f6';                         // Image, Both(red)
                    }
                }
            } else if (belowThresholdProgramBoth) {
                if (belowThresholdColorGreen) {
                    if (aboveThresholdProgramNumber) {
                        if (aboveThresholdColorGreen) {
                            program_hex = '5f';                     // Both(green), Number(green)
                        } else if (aboveThresholdColorRed) {
                            program_hex = 'db';                     // Both(green), Number(red)
                        }
                    } else if (aboveThresholdProgramImage) {
                        program_hex = 'eb';                         // Both(green), Image
                    } else if (aboveThresholdProgramBoth) {
                        if (aboveThresholdColorGreen) {
                            program_hex = '7b';                     // Both(green), Both(green)
                        } else if (aboveThresholdColorRed) {
                            program_hex = 'ff';                     // Both(green), Both(red)
                        }
                    }
                } else if (belowThresholdColorRed) {
                    if (aboveThresholdProgramNumber) {
                        if (aboveThresholdColorGreen) {
                            program_hex = '57';                     // Both(red), Number(green)
                        } else if (aboveThresholdColorRed) {
                            program_hex = 'd7';                     // Both(red), Number(red)
                        }
                    } else if (aboveThresholdProgramImage) {
                        program_hex = 'e7';                         // Both(red), Image
                    } else if (aboveThresholdProgramBoth) {
                        if (aboveThresholdColorGreen) {
                            program_hex = '77';                     // Both(red), Both(green)
                        } else if (aboveThresholdColorRed) {
                            program_hex = 'f7';                     // Both(red), Both(red)
                        }
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
            res.status(200).json({ message: 'Update Received and Sent.' });
            }
        });
        
        console.log('req:',hexBuffer);
    });
    //res.status(200).json({ message: 'Update Received and Sent.' });
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
