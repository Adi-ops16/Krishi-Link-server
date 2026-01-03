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
        const usersCollection = DB.collection('users')

        app.get("/", (req, res) => {
            res.send("Krishi-Link server is running")
        })

        // add user to database
        app.post('/user', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email })
            if (existingUser) {
                return res.send({ insertion: "Failed", message: "User already exists" })
            }

            const result = await usersCollection.insertOne(user)
            res.send({ insertion: "Success", message: "User created successfully" })
        })

        // all crops API
        app.get('/crops', async (req, res) => {
            const query = {}
            const type = req.query.type
            const price = req.query.price === 'asc' ? 1 : -1;
            if (type) {
                query.type = type
            }

            const result = await cropsCollection.find(query)
                .sort({ price_per_unit: price })
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

        // get all interests of a crop for user 
        app.get('/crops/:id/interests', verifyFirebaseToken, async (req, res) => {
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

        // API to modify status of interest
        app.patch('/crops/:id/interests/:interestId', verifyFirebaseToken, async (req, res) => {
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

        // get all posts of a user
        app.get('/crops-owner', verifyFirebaseToken, async (req, res) => {
            const ownerEmail = req.query.email
            const filter = {
                "owner.owner_email": ownerEmail
            }
            const result = await cropsCollection.find(filter).toArray()
            res.send(result)
        })

        // get all interests of a user 
        app.get('/interests/by', verifyFirebaseToken, async (req, res) => {
            const userEmail = req.query.email
            const crops = await cropsCollection.find({ "interests.interestedUserEmail": userEmail }).toArray()

            const interestsOfUser = []
            crops.forEach(crop => {
                crop.interests.forEach(interest => {
                    if (interest.interestedUserEmail === userEmail) {
                        interestsOfUser.push({
                            ...interest,
                            crop_name: crop.crop_name,
                            owner_name: crop.owner.owner_name,
                            crop_image: crop.crop_image,
                            _id: crop._id
                        })
                    }
                })
            })

            res.send(interestsOfUser)
        })

        // Add Crops API
        app.post('/crops', verifyFirebaseToken, async (req, res) => {
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

        // modify / update added crop

        app.patch('/update/crop/:id', verifyFirebaseToken, async (req, res) => {
            const id = req.params.id
            const updatedCrops = req.body
            const filter = {
                _id: new ObjectId(id)
            }
            const update = {
                $set: updatedCrops
            }
            const result = await cropsCollection.updateOne(filter, update)

            if (result.modifiedCount > 0) {
                return res.send({ status: 200, message: "Product updated successfully", modifiedCount: result.modifiedCount })
            }
            else {
                return res.send({ status: 404, message: "Product not found and no changes made" })
            }

            res.send({ status: 200, message: result })
        })


        //Delete crop
        app.delete('/delete/:id', verifyFirebaseToken, async (req, res) => {
            const id = req.params.id;
            const filter = {
                _id: new ObjectId(id)
            }
            const result = await cropsCollection.deleteOne(filter)

            if (result.deletedCount !== 0) {
                res.status(200).send({ status: 200, message: "success", deletedCount: result.deletedCount })
            }
            else {
                res.status(404).send({ status: 404, message: "Deletion failed." })
            }
        })

        // post interest for a crop API
        app.post('/crops/:id/interests', verifyFirebaseToken, async (req, res) => {
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

        // dashboard stats
        app.get('/dashboard/stats', verifyFirebaseToken, async (req, res) => {
            try {
                const { email } = req.query;

                if (!email) {
                    return res.status(400).json({ message: "Bad request: email is required" });
                }

                const pipeline = [
                    // 1. Only crops owned by this user
                    {
                        $match: {
                            "owner.owner_email": email
                        }
                    },

                    // 2. Count total crops before unwinding
                    {
                        $addFields: {
                            hasInterests: { $cond: [{ $isArray: "$interests" }, true, false] }
                        }
                    },

                    // 3. Unwind interests but keep crops without interests
                    {
                        $unwind: {
                            path: "$interests",
                            preserveNullAndEmptyArrays: true
                        }
                    },

                    // 4. Aggregate dashboard numbers
                    {
                        $group: {
                            _id: null,

                            // total crops listed
                            totalCropsListed: { $addToSet: "$_id" },

                            // pending interests
                            pendingInterestsCount: {
                                $sum: {
                                    $cond: [
                                        { $eq: ["$interests.status", "pending"] },
                                        1,
                                        0
                                    ]
                                }
                            },

                            // accepted interests
                            acceptedInterestsCount: {
                                $sum: {
                                    $cond: [
                                        { $eq: ["$interests.status", "accepted"] },
                                        1,
                                        0
                                    ]
                                }
                            },

                            // approximate profit (accepted only)
                            approximateProfit: {
                                $sum: {
                                    $cond: [
                                        { $eq: ["$interests.status", "accepted"] },
                                        "$interests.total_price",
                                        0
                                    ]
                                }
                            }
                        }
                    },

                    // 5. Shape final response
                    {
                        $project: {
                            _id: 0,
                            totalCropsListed: { $size: "$totalCropsListed" },
                            pendingInterestsCount: 1,
                            acceptedInterestsCount: 1,
                            approximateProfit: 1
                        }
                    }
                ];

                const result = await cropsCollection.aggregate(pipeline).toArray();

                res.send(
                    result[0] || {
                        totalCropsListed: 0,
                        pendingInterestsCount: 0,
                        acceptedInterestsCount: 0,
                        approximateProfit: 0
                    }
                );

            } catch (error) {
                console.error(error);
                res.status(500).json({ message: "Internal server error" });
            }
        });


        //  await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Krishi Link server is running on port: ${port}`)
})