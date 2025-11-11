const express = require('express');
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");


const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, "base64").toString("utf-8")
const serviceAccount = JSON.parse(decoded);


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


// middlewares
app.use(cors())
app.use(express.json())


const verifyFirebaseToken = async (req, res, next) => {
    const authorization = req.headers.Authorization || req.headers.authorization
    if (!authorization) {
        return res.status(201).send({ message: "You are not authorized to access this data" })
    }
    const token = authorization.split(" ")[1]
    if (!token) {
        return res.status(401).send({ message: "You are not authorized to access this data" })
    }
    try {
        const decoded = await admin.auth().verifyIdToken(token)
        next()
    }
    catch (error) {
        return res.status(401).send({ message: "Unauthorized access" })
    }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@personal-hero.gxzvpbe.mongodb.net/?appName=Personal-Hero`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // await client.connect();
        const DB = client.db("Krishi-Link-DB")
        const cropsCollection = DB.collection('crops')

        // all crops API
        app.get('/crops', async (req, res) => {
            const limit = parseInt(req.query.limit);
            const sortOrder = req.query.sort === 'asc' ? 1 : -1;

            const result = await cropsCollection.find()
                .sort({ created_at: sortOrder })
                .limit(limit)
                .toArray()

            res.send(result)
        })

        // get crops by id
        app.get('/crops/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await cropsCollection.findOne(query)
            res.send(result)
        })

        // get all interests of a crop for user API
        app.get('/crops/:id/interests', async (req, res) => {
            const userEmail = req.query.email
            const crop_id = new ObjectId(req.params.id)
            const crop = await cropsCollection.findOne({ _id: crop_id })
            if (crop.owner.owner_email !== userEmail) {
                return res.status(403).send({ message: "unauthorize access" })
            }
            res.send({
                interests: crop.interests
            })
        })

        // API to modify status
        app.patch('/crops/:id/interests/:interestId', async (req, res) => {
            const { id, interestId } = req.params
            const { status } = req.body

            const filter = {
                _id: new ObjectId(id),
                "interests.interest_id": new ObjectId(interestId)
            }
            const modify = {
                $set: {
                    "interests.$.status": status
                }
            }
            const result = await cropsCollection.updateOne(filter, modify)

            if (result.matchedCount == 0) {
                return res.status(404).send({ message: "interest not found" })
            }

            res.send({
                success: true,
                status: `Interest ${status}`,
                modifiedCount: result.modifiedCount
            })
        })

        // get all crops of a user posted
        app.get('/crops-owner', async (req, res) => {
            const ownerEmail = req.query.email
            const filter = {
                "owner.owner_email": ownerEmail
            }
            const result = await cropsCollection.find(filter).toArray()
            res.send(result)
        })

        // get all interests of a user 
        app.get('/interests/by', async (req, res) => {
            const userEmail = req.query.email
            const crops = await cropsCollection.find({ "interests.interestedUserEmail": userEmail }).toArray()

            const interestsOfUser = []
            crops.forEach(crop => {
                crop.interests.forEach(interest => {
                    if (interest.interestedUserEmail === userEmail) {
                        interestsOfUser.push(interest)
                    }
                })
            })

            res.send(interestsOfUser)
        })

        // Add Crops API
        app.post('/crops', async (req, res) => {
            const cropData = req.body;

            const newCrop = {
                ...cropData,
                interests: [],
                created_at: new Date(),
                updated_at: new Date()
            }
            const result = await cropsCollection.insertOne(newCrop)
            res.send(result)
        })

        // post interest for a crop API
        app.post('/crops/:id/interests', async (req, res) => {
            const crop_id = req.params.id
            const interest = req.body
            interest.interest_id = new ObjectId()
            interest.crop_id = new ObjectId(crop_id)
            interest.status = "pending"

            const update = {
                $push: { interests: interest }
            }
            const result = await cropsCollection.updateOne({ _id: new ObjectId(crop_id) }, update)

            res.send(result)
        })

        //  await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Krishi Link server is running on port: ${port}`)
})