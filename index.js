const express = require('express');
const dotend = require('dotenv').config();
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



    app.post('/booking', async (req, res) => {
      const car = req.body;
      const result = await bookingCollection.insertOne(car);
      res.send(result);
    })
    app.get('/booking/:id', verifyToken, async (req, res) => {
      
      
      const userId = req.params.id;
      const query = { userId: userId };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    })
    app.get('/cars/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carsCollection.findOne(query);
      res.send(result);
    })
    app.post('/cars', async (req, res) => {
      const car = req.body;
      const result = await carsCollection.insertOne(car);
      res.send(result);
    })

    app.get('/added-cars/:id', async (req, res) => {
      const id = req.params.id;
      const query = {userId: id};
      const result = await carsCollection.find(query).toArray();
      res.send(result);
    })
    app.delete('/added-cars/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await carsCollection.deleteOne(query);
      res.send(result);
    })
    app.get('/featured-cars', async (req, res) => {
      const result = await carsCollection.find().limit(3).toArray();
      res.send(result); 
    })
    app.patch('/cars/:id', async (req, res) => {
      const id = req.params.id;
      const result = await carsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { bookedUserCount: 1 } }
      );
      res.send(result);
    })
    app.patch('/update/:id', async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      
      const result = await carsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: body }
      );
      res.send(result);
    })
    app.get('/cars', async (req, res) => {
      const { search } = req.query;
     
      let cursor;
      if (search) {
        if (search === 'All') {
          cursor = carsCollection.find();
        } else {
          cursor = await carsCollection.find({
            $or: [
              {
                carName: {
                  $regex: search,
                  $options: 'i',
                },
              },
              {
                carType: {
                  $regex: search,
                  $options: 'i',
                },
              },
            ],
          });

        }

      }
      else {
        cursor = carsCollection.find();
      }

      const result = await cursor.toArray();
      res.send(result);
    })

  } finally {

  }

}


run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('server is running')
})





app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})