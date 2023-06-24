const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const moment = require('moment');
const twilio = require('twilio');
const qr = require('qrcode');
const env = require('dotenv').config();
const functions = require('firebase-functions');


// Initialize Firebase Admin SDK
const serviceAccount = require(process.env.SERVICEAUCCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(express.static(path.join(__dirname, 'public')));

// Twilio configuration
const accountSid = process.env.ACCOUNTSID;
const authToken = process.env.AUTHTOKEN;
const twilioClient = twilio(accountSid, authToken);
const twilioPhoneNumber = process.env.TWILIOPHONE;

// Route to handle form submission
app.post('/submit', async (req, res) => {
  try {
    const { name, email, phone, timeslot, people, countrycode } = req.body;

    // Save user data and timestamp to Firestore
    await db.collection('users').add({
      name,
      email,
      phone,
      countrycode,
      timeslot,
      people,
      timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
    });

    console.log(countrycode + phone)
    // Send SMS confirmation
    const messageBody = `Hey ${name}, thanks for signing up. Please come back at ${timeslot} and show this message to the door staff.`;
    const message = await twilioClient.messages.create({
      body: messageBody,
      from: 'Buffalo Security',
      to: countrycode + phone
    });

    console.log('SMS confirmation sent:', message.sid);

    res.redirect('/users'); // Redirect to the users page after successful submission
  } catch (error) {
    console.error('Error saving user data:', error);
    res.status(500).send('Failed to save user data.');
  }
});

app.post('/sendSMS', (req, res) => {
  const { phoneNumber, message } = req.body;

  console.log("Text message successfully sent !!");

  res.sendStatus(200); // Send a success response
});

// Route to retrieve users
app.get('/users', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = [];

    const timeslotCounts = {}; // Object to store the count of users in each timeslot

    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      users.push(userData);

      const timeslot = userData.timeslot;

      // Increment the count of users in each timeslot
      if (timeslot in timeslotCounts) {
        timeslotCounts[timeslot]++;
      } else {
        timeslotCounts[timeslot] = 1;
      }
    });

    // Save the timeslot counts to the 'global' collection
    await db.collection('global').doc('timeslotCounts').set(timeslotCounts);

    res.sendFile(path.join(__dirname, 'public/users.html'));
  } catch (error) {
    console.error('Error retrieving user data:', error);
    res.status(500).send('Failed to retrieve user data.');
  }
});

const deleteTimeslotCounts = async () => {
  try {
    await db.collection('global').doc('timeslotCounts').delete();
    console.log('timeslotCounts document deleted');
  } catch (error) {
    console.error('Error deleting timeslotCounts document:', error);
  }
};

// Schedule the deletion of 'timeslotCounts' document every minute
const scheduleTimeslotCountsDeletion = () => {
  const now = moment();
  const nextDeletion = moment().startOf('day').add(1, 'day').set('hour', 1);

  const delay = nextDeletion.diff(now);

  setTimeout(async () => {
    await deleteTimeslotCounts();
    scheduleTimeslotCountsDeletion(); // Reschedule for the next day
  }, delay);
};

scheduleTimeslotCountsDeletion();


// Route to handle sending text messages
app.post('/sendText', async (req, res) => {
  try {
    const { userId, phoneNumber, message } = req.body; // Add 'message' to the request body

    if (!userId || typeof userId !== 'string') {
      res.status(400).send('Invalid userId provided.'); // Send a bad request response if userId is missing or invalid
      return;
    }

    // Retrieve the user data from Firestore
    const userRef = db.collection('users').doc(userId);
    const userSnapshot = await userRef.get();

    if (userSnapshot.exists) {
      const userData = userSnapshot.data();
      const timeslot = userData.timeslot;

      // Send SMS message with the provided message
      const twilioMessage = await twilioClient.messages.create({
        body: message, // Use the provided message instead of the hardcoded message
        from: twilioPhoneNumber,
        to: phoneNumber
      });

      console.log('Text message sent:', twilioMessage.sid);

      res.sendStatus(200); // Send a success response
    } else {
      res.status(404).send('User not found.'); // Send a not found response if the user doesn't exist
    }
  } catch (error) {
    console.error('Error sending text message:', error);
    res.status(500).send('Failed to send text message.');
  }
});



// Route to serve the qrcode.html file
app.get('/qrcode', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/qrcode.html'));
});

// Route to serve the home.html file
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/success.html'));
});



app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
