const express = require('express');
const dotenv = require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const app = express();
app.use(cors());
app.use(express.json());
const uri = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const JWKS = createRemoteJWKSet(new URL(`${process.env.BASE_URL}/api/auth/jwks`));

const verifyToken = async (req,res,next) => {
  const authHeader = req?.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'unauthorized access'});
  }
  console.log(authHeader);
  const token = authHeader?.split(' ')[1];
  if(!token){
    return res.status(401).send({message: 'unauthorized access'});
  }
 try {
   const {payload} = await jwtVerify(token, JWKS);
   console.log(payload);
   next();
   
 } catch (error) {
  return res.status(403).json({message: 'forbidden access'});
  
 }
}

async function run() {
  try {
    const db = client.db("DriveLoop");
    const carsCollection = db.collection("cars");
    const bookingCollection = db.collection("booking");

    // Book a car
    app.post('/booking', verifyToken, async (req, res) => {
      const car = req.body;
      const result = await bookingCollection.insertOne(car);
      res.send(result);
    })

    // Get bookings made by a user (Renter view)
    app.get('/booking/:id', verifyToken, async (req, res) => {
      const userId = req.params.id;
      const query = { userId: userId };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    })

    // Get booking requests received by a car owner (Owner/Host view)
    app.get('/requests/:ownerId', verifyToken, async (req, res) => {
      const ownerId = req.params.ownerId;
      const query = { ownerId: ownerId };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    })

    // Accept a booking request
    app.patch('/booking/accept/:bookingId', verifyToken, async (req, res) => {
      const bookingId = req.params.bookingId;
      try {
        const booking = await bookingCollection.findOne({ _id: new ObjectId(bookingId) });
        if (!booking) {
          return res.status(404).send({ message: 'Booking request not found' });
        }

        // 1. Accept this specific booking
        const acceptResult = await bookingCollection.updateOne(
          { _id: new ObjectId(bookingId) },
          { $set: { status: 'accepted' } }
        );

        // 2. Reject all other pending bookings for the same carId
        let rejectResult = null;
        if (booking.carId) {
          rejectResult = await bookingCollection.updateMany(
            {
              carId: booking.carId,
              _id: { $ne: new ObjectId(bookingId) },
              status: 'pending'
            },
            { $set: { status: 'rejected' } }
          );

          // 3. Update the car availability status to "Unavailable"
          await carsCollection.updateOne(
            { _id: new ObjectId(booking.carId) },
            { $set: { availabilityStatus: 'Unavailable' } }
          );
        }

        res.send({ success: true, acceptResult, rejectResult });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    })

    // Decline a booking request
    app.patch('/booking/decline/:bookingId', verifyToken, async (req, res) => {
      const bookingId = req.params.bookingId;
      try {
        const result = await bookingCollection.updateOne(
          { _id: new ObjectId(bookingId) },
          { $set: { status: 'rejected' } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    })

    // Cancel/delete a booking request
    app.delete('/booking/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      try {
        const query = { _id: new ObjectId(id) };
        const booking = await bookingCollection.findOne(query);
        if (booking && booking.status === 'accepted' && booking.carId) {
          // Reset availability status back to Available
          await carsCollection.updateOne(
            { _id: new ObjectId(booking.carId) },
            { $set: { availabilityStatus: 'Available' } }
          );
        }
        const result = await bookingCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    })

    // Get car by ID
    app.get('/cars/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carsCollection.findOne(query);
      res.send(result);
    })

    // Add a car
    app.post('/cars', verifyToken, async (req, res) => {
      const car = req.body;
      const result = await carsCollection.insertOne(car);
      res.send(result);
    })

    // Get cars added by owner
    app.get('/added-cars/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { userId: id };
      const result = await carsCollection.find(query).toArray();
      res.send(result);
    })

    // Delete an added car
    app.delete('/added-cars/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carsCollection.deleteOne(query);
      res.send(result);
    })

    // Get featured cars
    app.get('/featured-cars', async (req, res) => {
      const result = await carsCollection.find().limit(3).toArray();
      res.send(result); 
    })

    // Update car
    app.patch('/update/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const result = await carsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: body }
      );
      res.send(result);
    })

    // Get all cars with search
    app.get('/cars', async (req, res) => {
      const { search } = req.query;
      let cursor;
      if (search) {
        if (search === 'All') {
          cursor = carsCollection.find();
        } else {
          cursor = await carsCollection.find({
            $or: [
              { carName: { $regex: search, $options: 'i' } },
              { carType: { $regex: search, $options: 'i' } }
            ]
          });
        }
      } else {
        cursor = carsCollection.find();
      }
      const result = await cursor.toArray();
      res.send(result);
    })

  } finally {
    // Keep client alive
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('server is running')
})

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})
