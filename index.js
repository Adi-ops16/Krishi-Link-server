const express = require('express');
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 3000;

// middlewares
app.use(cors())
app.use(express.json())

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

        // Add Crops API
        app.post('/crops', async (req, res) => {
            const cropData = req.body;

            const newCrop = {
                ...cropData,
                interest: [],
                created_at: new Date(),
                updated_at: new Date()
            }
            const result = await cropsCollection.insertOne(newCrop)
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